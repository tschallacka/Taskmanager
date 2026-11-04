// Reading and checking a request for a new API key, and what a team key may be limited to.
// Shared by the personal key endpoint and the team keys endpoint, so both refuse the same things.
import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { apiKeys, API_KEY_SCOPES, customers, projects } from '../db/schema'
import type { ApiKeyScope } from '../db/schema'
import { generateApiKey, isApiKeyScope } from './api-keys'
import { requireInstanceAdmin } from './instanceAdmin'

export const MAX_KEY_NAME_LENGTH = 60
const MAX_EXPIRY_DAYS = 3650

export interface KeyRequest {
  name: string
  scopes: ApiKeyScope[]
  expiresAt: number | null
}

/** Reads the name, permissions and expiry of a key request; refuses anything a key cannot carry. */
export async function readKeyRequest(event: H3Event, body: { name?: unknown, scopes?: unknown, expiresInDays?: unknown }): Promise<KeyRequest> {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) throw createError({ statusCode: 400, message: 'Give the key a name' })
  if (name.length > MAX_KEY_NAME_LENGTH) {
    throw createError({ statusCode: 400, message: `Key names are limited to ${MAX_KEY_NAME_LENGTH} characters` })
  }

  const scopes = [...new Set(Array.isArray(body.scopes) ? body.scopes : [])].filter(isApiKeyScope)
  // A crew key creates and rotates whole crews; only the instance admin may hold one.
  if (scopes.includes('crews:manage')) await requireInstanceAdmin(event)
  if (!scopes.length) {
    throw createError({ statusCode: 400, message: `Pick at least one permission (${API_KEY_SCOPES.join(', ')})` })
  }

  let expiresAt: number | null = null
  if (body.expiresInDays !== undefined && body.expiresInDays !== null) {
    const days = Number(body.expiresInDays)
    if (!Number.isFinite(days) || days < 1 || days > MAX_EXPIRY_DAYS) {
      throw createError({ statusCode: 400, message: 'Expiry must be between 1 and 3650 days' })
    }
    expiresAt = Date.now() + Math.floor(days) * 86_400_000
  }
  return { name, scopes, expiresAt }
}

export interface KeyLimit {
  customerId: string | null
  projectId: string | null
}

export class KeyLimitError extends Error {}

/** What a key is limited to, from a request: at most one of a customer and a board. */
export function readKeyLimit(body: { customerId?: unknown, projectId?: unknown }): KeyLimit {
  const text = (value: unknown, label: string): string | null => {
    if (value === undefined || value === null || value === '') return null
    if (typeof value !== 'string') throw new KeyLimitError(`The ${label} must be an id.`)
    return value
  }
  const customerId = text(body.customerId, 'customer')
  const projectId = text(body.projectId, 'board')
  if (customerId && projectId) throw new KeyLimitError('A key is limited to one board or one customer, not both.')
  return { customerId, projectId }
}

/** Confirms the customer or board a key is limited to belongs to the team the key is for. */
export async function requireLimitInTeam(teamId: string, limit: KeyLimit): Promise<void> {
  if (limit.customerId) {
    const [row] = await db.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, limit.customerId), eq(customers.organizationId, teamId)))
    if (!row) throw new KeyLimitError('That customer is not one of this team\'s customers.')
  }
  if (limit.projectId) {
    const [row] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, limit.projectId), eq(projects.teamId, teamId)))
    if (!row) throw new KeyLimitError('That board is not one of this team\'s boards.')
  }
}

/** Stores a new key for a person and returns it with the full token, which is shown once and never kept. */
export async function issueKey(input: { userId: string, teamId: string | null, request: KeyRequest, limit?: KeyLimit }) {
  const generated = generateApiKey()
  const [created] = await db.insert(apiKeys).values({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    userId: input.userId,
    teamId: input.teamId,
    customerId: input.limit?.customerId ?? null,
    projectId: input.limit?.projectId ?? null,
    name: input.request.name,
    keyHash: generated.hash,
    keyPrefix: generated.displayPrefix,
    scopes: input.request.scopes,
    expiresAt: input.request.expiresAt,
    createdAt: Date.now()
  }).returning()
  return { token: generated.token, key: created! }
}
