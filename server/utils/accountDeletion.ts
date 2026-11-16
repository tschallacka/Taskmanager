// Deleting a person's account (card mwjfpokj5rvl92bserd, approved plan). The rules are in accountRules.ts; this file
// carries them out in one transaction. A personal board with no other member goes with its tasks, its attachment files
// and its avatar folder; a team board, or a personal one someone else is on, stays with the 'Deleted user' name.
import { existsSync, rmSync } from 'node:fs'
import { and, eq, inArray, isNull, like, ne, or } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { db } from '../db'
import * as schema from '../db/schema'
import { ACCOUNT_RULES, DELETED_USER_ID } from './accountRules'
import type { AccountRule } from './accountRules'
import { removeTaskAttachments } from './attachments'
import { isCrewAddress, personKeyOf } from './crewAccounts'
import { avatarDir } from './avatarStore'

const DELETED_EMAIL = 'deleted-user@deleted.invalid'

export interface DeletionResult {
  deletedBoards: string[]
  tombstonedBoards: string[]
  deletedTasks: string[]
}

type AnyTable = Parameters<typeof getTableConfig>[0]

// The drizzle table and column for a database table and column name, from the schema.
function locate(tableName: string, columnName: string): { table: AnyTable, key: string, column: unknown } | null {
  for (const value of Object.values(schema)) {
    let config: ReturnType<typeof getTableConfig>
    try {
      config = getTableConfig(value as AnyTable)
    } catch {
      continue
    }
    if (config.name !== tableName) continue
    const column = config.columns.find(candidate => candidate.name === columnName)
    if (!column) return null
    const key = Object.keys(value as object).find(name => (value as Record<string, unknown>)[name] === column)
    if (!key) return null
    return { table: value as AnyTable, key, column }
  }
  return null
}

/** The user's own rows and the rule for each column: a helper for the transaction below. */
async function applyColumnRule(tx: Pick<typeof db, 'delete' | 'update'>, tableName: string, columnName: string, rule: Exclude<AccountRule, 'by-scope'>, userId: string) {
  const found = locate(tableName, columnName)
  if (!found) throw new Error(`account rule ${tableName}.${columnName} names no column`)
  const { table, key, column } = found as unknown as { table: never, key: string, column: never }
  if (rule === 'delete') {
    await tx.delete(table).where(eq(column, userId))
  } else if (rule === 'tombstone') {
    await tx.update(table).set({ [key]: DELETED_USER_ID } as never).where(eq(column, userId))
  } else {
    await tx.update(table).set({ [key]: null } as never).where(eq(column, userId))
  }
}

/**
 * The crew key of a crew account, and its crew: the key its crew mail is sent and received under. A person who is not a
 * crew account has none, and so no crew mail (crew mail is only between crew accounts).
 */
export async function crewMailKeyOf(tx: Pick<typeof db, 'select'>, userId: string): Promise<{ crewId: string, key: string } | null> {
  const [person] = await tx.select().from(schema.user).where(eq(schema.user.id, userId))
  if (!person || !person.crewId || !isCrewAddress(person.email)) return null
  const [crew] = await tx.select().from(schema.crews).where(eq(schema.crews.id, person.crewId))
  if (!crew) return null
  return { crewId: crew.id, key: personKeyOf(crew.slug, person.email) }
}

/**
 * Deletes the crew mail where a key is the sender or the recipient, within one crew. Returns the number of rows removed.
 * An empty key list removes nothing.
 */
export async function deleteCrewMailFor(tx: Pick<typeof db, 'delete'>, crewId: string, keys: string[]): Promise<number> {
  if (keys.length === 0) return 0
  const gone = await tx.delete(schema.crewMail)
    .where(and(eq(schema.crewMail.crewId, crewId), or(inArray(schema.crewMail.fromKey, keys), inArray(schema.crewMail.toKey, keys))))
    .returning({ id: schema.crewMail.id })
  return gone.length
}

/** The tombstone row: the name shown for the person's kept work. Created once; it cannot sign in. */
async function ensureTombstone(tx: Pick<typeof db, 'insert'>) {
  const at = new Date()
  await tx.insert(schema.user).values({
    id: DELETED_USER_ID,
    name: 'Deleted user',
    email: DELETED_EMAIL,
    emailVerified: false,
    createdAt: at,
    updatedAt: at
  }).onConflictDoNothing()
}

export interface AccountRefusal {
  message: string
  /** The teams this person owns, when the refusal is the owner rule. */
  teams?: { id: string, name: string }[]
}

/**
 * Why the account may not be deleted yet, or null. A crew account goes with its crew. A team owner hands the team over
 * (or deletes it) first, and the teams are named. The last instance admin needs another admin first.
 */
export async function accountRefusal(userId: string): Promise<AccountRefusal | null> {
  const [person] = await db.select().from(schema.user).where(eq(schema.user.id, userId))
  if (!person) return null
  if (isCrewAddress(person.email)) {
    return { message: 'This is a crew account: it goes with its crew, and cannot be deleted here.' }
  }
  const owned = await db.select({ id: schema.organization.id, name: schema.organization.name })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(and(eq(schema.member.userId, userId), like(schema.member.role, '%owner%')))
  if (owned.length) {
    return {
      message: 'You own a team. Hand it over to another member, or delete it, before you delete your account.',
      teams: owned
    }
  }
  if (person.isInstanceAdmin) {
    const others = await db.select({ id: schema.user.id }).from(schema.user)
      .where(and(eq(schema.user.isInstanceAdmin, true), ne(schema.user.id, userId)))
    if (others.length === 0) {
      return { message: 'You are the only instance admin. Make another person an instance admin before you delete your account.' }
    }
  }
  return null
}

/**
 * Deletes the person's account as the rules say. Returns what was deleted and what was kept, for the response and the
 * tests. Nothing is removed for a person who no longer exists (a second call is a no-op).
 */
export async function deleteAccount(userId: string): Promise<DeletionResult> {
  const refusal = await accountRefusal(userId)
  if (refusal) {
    throw createError({ statusCode: 409, statusMessage: 'Conflict', message: refusal.message, data: { teams: refusal.teams ?? [] } })
  }
  const result: DeletionResult = { deletedBoards: [], tombstonedBoards: [], deletedTasks: [] }
  const avatarFolder = avatarDir(userId)

  await db.transaction(async (tx) => {
    await ensureTombstone(tx)

    // Boards: a personal board with no other member goes; anything a team holds, or someone else is on, stays.
    const boards = await tx.select({ id: schema.projects.id, teamId: schema.projects.teamId }).from(schema.projects).where(eq(schema.projects.userId, userId))
    for (const board of boards) {
      const others = await tx.select({ id: schema.projectMembers.id }).from(schema.projectMembers)
        .where(and(eq(schema.projectMembers.projectId, board.id), ne(schema.projectMembers.userId, userId)))
      const guests = await tx.select({ id: schema.projectGuests.id }).from(schema.projectGuests)
        .where(and(eq(schema.projectGuests.projectId, board.id), ne(schema.projectGuests.userId, userId)))
      if (board.teamId === null && others.length === 0 && guests.length === 0) {
        const tasks = await tx.select({ id: schema.projectTasks.id }).from(schema.projectTasks).where(eq(schema.projectTasks.projectId, board.id))
        result.deletedTasks.push(...tasks.map(task => task.id))
        result.deletedBoards.push(board.id)
      } else {
        result.tombstonedBoards.push(board.id)
      }
    }
    if (result.deletedBoards.length) {
      await tx.delete(schema.projects).where(or(...result.deletedBoards.map(boardId => eq(schema.projects.id, boardId))))
    }
    await tx.update(schema.projects).set({ userId: DELETED_USER_ID }).where(eq(schema.projects.userId, userId))

    // Goals and portfolios: team-scoped ones are kept as the tombstone's; personal ones go.
    await tx.delete(schema.goals).where(and(eq(schema.goals.userId, userId), isNull(schema.goals.teamId)))
    await tx.update(schema.goals).set({ userId: DELETED_USER_ID }).where(eq(schema.goals.userId, userId))
    await tx.delete(schema.portfolios).where(and(eq(schema.portfolios.userId, userId), isNull(schema.portfolios.teamId)))
    await tx.update(schema.portfolios).set({ userId: DELETED_USER_ID }).where(eq(schema.portfolios.userId, userId))

    // Crew mail: the rows of the person's crew key, when the person is a crew account (see crewMailKeyOf).
    const mail = await crewMailKeyOf(tx, userId)
    if (mail) await deleteCrewMailFor(tx, mail.crewId, [mail.key])

    // Every other column, by its rule.
    for (const [key, rule] of Object.entries(ACCOUNT_RULES)) {
      if (rule === 'by-scope' || rule === 'delete-by-key') continue
      const [tableName, columnName] = key.split('.') as [string, string]
      await applyColumnRule(tx, tableName, columnName, rule, userId)
    }

    await tx.delete(schema.user).where(eq(schema.user.id, userId))
  })

  // The files go after the rows: a rolled-back transaction must leave them.
  removeTaskAttachments(result.deletedTasks)
  if (existsSync(avatarFolder)) rmSync(avatarFolder, { recursive: true, force: true })
  return result
}
