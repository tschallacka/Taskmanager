// A crew's members forked for one board (Q36, Q43a). Each fork is its own account, named for the board
// (`internal-tools-wren`), and its key is limited to exactly that board's shadow board (Q29a), so a crew that
// works on several boards has agents that each show which board they work for and reach nothing else.
//   - a fork belongs to the crew (user.crewId): disabling the crew cuts it off with the rest;
//   - the crew's own rotate leaves forks alone (accountsOf in crewProvisioning), since a rotate mints keys
//     for the whole crew team and would undo the limit;
//   - rotating a fork's keys, and removing the forks, go through this module and nowhere else.
// Passwords and keys leave here once, in the result; nothing logs them.
import { randomBytes } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'
import { createError } from 'h3'
import { db } from '../db'
import { account, apiKeys, crewBoardMembers, member, session, user } from '../db/schema'
import type { Crew, CrewBoard } from '../db/schema'
import { createCrewAccount, crewAddress } from './crewAccounts'
import { CREW_PEOPLE } from './crewProvisioning'
import { EXTRA_WORKERS } from '../../shared/utils/extraWorkers'
import { issueKey } from './keyIssue'
import { genId } from './projects'

/** The members that work on a board. Boss stays one for the whole crew, and the customer logins belong to the product. */
const FORKED_KEYS = ['pia', 'wren', 'wick', 'wynn', 'wade', 'usher', 'nina', 'quincy']
export const FORK_PEOPLE = CREW_PEOPLE.filter(person => FORKED_KEYS.includes(person.key))

/**
 * Extra workers: not forked with the standard members. A board gets them when they are asked for, and
 * adding them leaves every fork that is already there alone. Probation workers run on a local model.
 */
export const EXTRA_PEOPLE = EXTRA_WORKERS

/** The extra workers a request names, checked: an unknown key is refused with the keys that exist. */
export function extraKeysOf(raw: unknown): string[] {
  if (raw === undefined || raw === null) return []
  const allowed: string[] = EXTRA_PEOPLE.map(person => person.key)
  if (!Array.isArray(raw) || raw.some(key => typeof key !== 'string' || !allowed.includes(key))) {
    throw createError({ statusCode: 400, message: `add must name extra workers from: ${allowed.join(', ')}.` })
  }
  return [...new Set(raw as string[])]
}

export interface ForkedMember {
  key: string
  name: string
  /** The name its Claude Code agent type gets: the board, then the person. */
  agentType: string
  email: string
  password: string
  apiKey: string
}

export interface ForkView {
  key: string
  name: string
  agentType: string
  keyLastUsed: number | null
}

function slugOf(text: string, max: number): string {
  const slug = text.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '')
  return slug || 'board'
}

/** `internal-tools-wren`: the board's name, then the person's first name. */
export function forkAgentType(boardName: string, personName: string): string {
  return `${slugOf(boardName, 30)}-${slugOf(personName.split(/\s+/)[0] ?? '', 20)}`
}

function secret(): string {
  return randomBytes(24).toString('base64url')
}

const FORK_SCOPES: ('boards:read' | 'boards:write')[] = ['boards:read', 'boards:write']

// A key limited to the one shadow board the fork works on.
async function mintForkKey(userId: string, teamId: string, shadowProjectId: string, agentType: string): Promise<string> {
  const { token } = await issueKey({
    userId,
    teamId,
    request: { name: `fork ${agentType}`, scopes: FORK_SCOPES, expiresAt: null },
    limit: { customerId: null, projectId: shadowProjectId }
  })
  return token
}

/**
 * Forks the crew's working members for the board of `link`, or, with `rotate`, gives the existing forks new
 * passwords and keys and ends their sessions. A failed first fork leaves nothing of itself behind.
 */
export async function forkCrew(input: { crew: Crew, link: CrewBoard, boardName: string, rotate: boolean, add?: string[] }): Promise<ForkedMember[]> {
  const { crew, link, boardName } = input
  const add = input.add ?? []
  const existing = await db.select().from(crewBoardMembers).where(eq(crewBoardMembers.linkId, link.id))
  if (existing.length && !input.rotate && !add.length) {
    throw createError({ statusCode: 409, message: 'This crew is already forked for the board. Rotate to get new keys.' })
  }
  const known = new Set(existing.map(row => row.personKey))
  // A first fork makes the standard members and the asked-for extras. A rotate gives every fork new keys,
  // extras included, and makes the asked-for extras that are not there yet. Without a rotate, a board that
  // is forked gets only the extras that are asked for and not there yet: every fork already there stays.
  const people: { key: string, name: string }[] = !existing.length
    ? [...FORK_PEOPLE, ...EXTRA_PEOPLE.filter(person => add.includes(person.key))]
    : input.rotate
      ? [...FORK_PEOPLE, ...EXTRA_PEOPLE.filter(person => known.has(person.key) || add.includes(person.key))]
      : EXTRA_PEOPLE.filter(person => add.includes(person.key) && !known.has(person.key))

  const made: string[] = []
  const result: ForkedMember[] = []
  try {
    for (const person of people) {
      const password = secret()
      const agentType = forkAgentType(boardName, person.name)
      const existingRow = existing.find(row => row.personKey === person.key)
      let userId: string
      let email: string

      if (existingRow) {
        userId = existingRow.userId
        const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId))
        email = row?.email ?? ''
        await db.delete(apiKeys).where(eq(apiKeys.userId, userId))
        await db.delete(session).where(eq(session.userId, userId))
        // The credential row, not updateUser: the update hook refuses an .invalid address.
        await db.update(account)
          .set({ password: await hashPassword(password), updatedAt: new Date() })
          .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
      } else {
        email = crewAddress(`${crew.slug}-f${link.id}`, person.key)
        const created = await createCrewAccount({ email, name: `${person.name} (${boardName})`, password, crewId: crew.id })
        userId = created.id
        made.push(userId)
        await db.insert(member).values({ id: genId(), organizationId: crew.teamId, userId, role: 'member', createdAt: new Date() })
        await db.insert(crewBoardMembers).values({ id: genId(), linkId: link.id, userId, personKey: person.key, agentType, createdAt: Date.now() })
      }

      result.push({
        key: person.key,
        name: person.name,
        agentType: existingRow?.agentType ?? agentType,
        email,
        password,
        apiKey: await mintForkKey(userId, crew.teamId, link.shadowProjectId, existingRow?.agentType ?? agentType)
      })
    }
    return result
  } catch (error) {
    // Accounts go with their sessions, keys and fork rows. The cause is not logged: a database error can carry a password hash.
    if (made.length) await db.delete(user).where(inArray(user.id, made))
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({ statusCode: 500, message: 'The crew could not be forked. Nothing was kept; try again.' })
  }
}

/** The forks of a board's link, without any secret. */
export async function forksOfLink(linkId: string): Promise<ForkView[]> {
  const rows = await db
    .select({ userId: crewBoardMembers.userId, key: crewBoardMembers.personKey, agentType: crewBoardMembers.agentType, name: user.name })
    .from(crewBoardMembers)
    .innerJoin(user, eq(user.id, crewBoardMembers.userId))
    .where(eq(crewBoardMembers.linkId, linkId))
  if (!rows.length) return []
  const keys = await db.select({ userId: apiKeys.userId, lastUsedAt: apiKeys.lastUsedAt }).from(apiKeys).where(inArray(apiKeys.userId, rows.map(row => row.userId)))
  const order: string[] = [...FORK_PEOPLE, ...EXTRA_PEOPLE].map(person => person.key)
  return rows
    .map((row) => {
      const used = keys.filter(k => k.userId === row.userId && k.lastUsedAt !== null).map(k => k.lastUsedAt as number)
      return { key: row.key, name: row.name, agentType: row.agentType, keyLastUsed: used.length ? Math.max(...used) : null }
    })
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
}

/** Deletes the forks of a link, with their sessions and keys. Used when the crew is taken off the board. */
export async function removeForks(linkId: string): Promise<void> {
  const rows = await db.select({ userId: crewBoardMembers.userId }).from(crewBoardMembers).where(eq(crewBoardMembers.linkId, linkId))
  if (rows.length) await db.delete(user).where(inArray(user.id, rows.map(row => row.userId)))
}
