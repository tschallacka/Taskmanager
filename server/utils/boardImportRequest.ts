// The request side of a board import: who is calling and whether they may import, the query options, and
// reading the backup from the body. The routes (POST /api/projects/:id/import and POST /api/projects/import)
// call these and then the planner and the writer in boardImport.ts.
import { and, eq } from 'drizzle-orm'
import { createError, getHeader, getQuery, readRawBody } from 'h3'
import type { H3Event } from 'h3'
import { db } from '../db'
import { member, projects, user } from '../db/schema'
import { authenticateApiKey, forCall, hasScope } from './api-keys'
import type { ApiKeyContext } from './api-keys'
import { audienceOf, boardFilter } from './mcpAccess'
import { requireProject, requireStaff } from './projects'
import { importMaxBytes, importRefusal } from './boardImport'
import type { ImportCaller } from './boardImport'
import type { ImportOptions } from './boardImportPlan'

/** The one calling: a session user, or the owner of an API key. */
export interface Caller extends ImportCaller {
  userId: string
  name: string
  keyId: string | null
  keyName: string
  /** The key, when the call came with one. */
  context: ApiKeyContext | null
}

/** Who calls, and for an API key, that it carries the import permission. */
export async function whoIsCalling(event: H3Event): Promise<Caller> {
  const header = getHeader(event, 'authorization') ?? ''
  let userId: string
  let context: ApiKeyContext | null = null
  let keyId: string | null = null
  let keyName = 'Board settings'
  if (/^Bearer\s/i.test(header)) {
    // An import is a write: a token with per-board grants reaches the boards that grant it the write permission.
    context = forCall(await authenticateApiKey(event), 'boards:write')
    // A key imports with the ordinary write permission on the board it reaches; the admin rule below then decides.
    if (!hasScope(context, 'boards:write')) {
      throw createError({ statusCode: 403, message: 'This key may not change boards, so it cannot import a board backup.' })
    }
    userId = context.userId
    keyId = context.keyId
    keyName = context.keyName
  } else {
    userId = event.context.session.user.id
  }
  const [owner] = await db.select({ name: user.name, crewId: user.crewId, isInstanceAdmin: user.isInstanceAdmin }).from(user).where(eq(user.id, userId))
  return {
    userId,
    name: owner?.name || 'Importer',
    keyId,
    keyName,
    context,
    isCrew: Boolean(owner?.crewId),
    isInstanceAdmin: Boolean(owner?.isInstanceAdmin),
    teamRole: null,
    personalOwner: false
  }
}

/** The caller's role in a team, or null when they are not a member of it. */
export async function roleIn(teamId: string, userId: string): Promise<string | null> {
  const [row] = await db.select({ role: member.role }).from(member)
    .where(and(eq(member.organizationId, teamId), eq(member.userId, userId)))
  return row?.role ?? null
}

/** The board an import writes into, as the caller may reach it, with the caller's standing. Refuses with a sentence. */
export async function callerForBoard(event: H3Event, projectId: string): Promise<{ caller: Caller, project: { id: string, teamId: string | null, userId: string } }> {
  const who = await whoIsCalling(event)
  let project: { id: string, teamId: string | null, userId: string }
  if (who.context) {
    const [row] = await db.select().from(projects).where(and(eq(projects.id, projectId), await boardFilter(who.context)))
    if (!row) throw createError({ statusCode: 404, message: 'Project not found' })
    if (audienceOf(who.context, row) !== 'staff') {
      throw createError({ statusCode: 403, message: 'Only the project team can import into this board' })
    }
    project = row
  } else {
    const row = await requireProject(event, projectId)
    if (row.readOnly) throw createError({ statusCode: 403, message: 'This is a crew board. You can read it, not change it.' })
    requireStaff(row)
    project = row
  }
  const caller: Caller = {
    ...who,
    teamRole: project.teamId ? await roleIn(project.teamId, who.userId) : null,
    personalOwner: !project.teamId && project.userId === who.userId
  }
  const refusal = importRefusal(caller)
  if (refusal) throw createError({ statusCode: 403, message: refusal })
  return { caller, project }
}

/** The caller for an import that creates a board in a team (or a personal board when there is no team). */
export async function callerForNewBoard(event: H3Event, teamId: string | null): Promise<Caller> {
  const who = await whoIsCalling(event)
  if (who.context && who.context.teamId && teamId !== who.context.teamId) {
    throw createError({ statusCode: 403, message: 'This key cannot create a board in that team' })
  }
  const caller: Caller = {
    ...who,
    teamRole: teamId ? await roleIn(teamId, who.userId) : null,
    personalOwner: !teamId
  }
  const refusal = importRefusal(caller)
  if (refusal) throw createError({ statusCode: 403, message: refusal })
  return caller
}

/** Reads the query options of an import. Anything malformed is a 400; `force` is the instance admin's alone. */
export function readImportOptions(event: H3Event, caller: Caller): ImportOptions {
  const query = getQuery(event)
  const onMissing = query.onMissingColumn ?? 'create'
  if (onMissing !== 'create' && onMissing !== 'fail') {
    throw createError({ statusCode: 400, message: 'onMissingColumn must be create or fail' })
  }
  const force = query.force === '1' || query.force === 'true'
  if (force && !caller.isInstanceAdmin) {
    throw createError({ statusCode: 403, message: 'Only the instance admin can import a damaged backup (force)' })
  }
  const idempotencyKey = typeof query.idempotencyKey === 'string' && query.idempotencyKey.trim()
    ? query.idempotencyKey.trim().slice(0, 200)
    : null
  return {
    dryRun: query.dryRun === '1' || query.dryRun === 'true',
    columnMap: parseMap(query.columnMap, 'columnMap'),
    authorMap: parseMap(query.authorMap, 'authorMap'),
    onMissingColumn: onMissing,
    idempotencyKey,
    force
  }
}

function parseMap(value: unknown, name: string): Record<string, string> {
  if (value === undefined || value === '') return {}
  if (typeof value !== 'string') throw createError({ statusCode: 400, message: `${name} must be a JSON object` })
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw createError({ statusCode: 400, message: `${name} is not valid JSON` })
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createError({ statusCode: 400, message: `${name} must be a JSON object` })
  }
  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof val !== 'string' || val.length > 320) {
      throw createError({ statusCode: 400, message: `${name}: the value for "${key.slice(0, 60)}" must be a short text` })
    }
    out[key] = val
  }
  return out
}

/** Reads the backup from the body: JSON, within the size limit. Refuses anything else. */
export async function readBackupBody(event: H3Event): Promise<unknown> {
  const type = getHeader(event, 'content-type') ?? ''
  if (!/^application\/json\b/i.test(type)) {
    throw createError({ statusCode: 415, message: 'Send the backup as application/json.' })
  }
  const max = importMaxBytes()
  const declared = Number(getHeader(event, 'content-length'))
  if (Number.isFinite(declared) && declared > max) {
    throw createError({ statusCode: 413, message: `The backup is larger than ${max} bytes.` })
  }
  const raw = await readRawBody(event, false)
  if (!raw || raw.length === 0) throw createError({ statusCode: 400, message: 'The request has no backup in it.' })
  if (raw.length > max) throw createError({ statusCode: 413, message: `The backup is larger than ${max} bytes.` })
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw createError({ statusCode: 400, message: 'The file is not valid JSON.' })
  }
}
