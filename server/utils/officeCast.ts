// Who sits in the office view of a board. A crew's shadow board seats the members forked for it; a
// crew's own board seats the crew's accounts; anyone else a task is assigned to gets a guest desk.
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { crewBoardMembers, crewBoards, crews, user } from '../db/schema'
import { personKeyOf } from './crewAccounts'
import { roleOfKey } from '../../shared/office/model'
import type { OfficePerson } from '../../shared/office/model'

// The customer logins of a crew never sit in the office.
const OUTSIDE_KEYS = new Set(['customer', 'contact'])
const ROLE_ORDER = ['pm', 'worker', 'ux', 'cq', 'qa', 'boss']

/** Whether a crew works on `projectId`: its shadow board, or the board the crew was made on. The office route answers from the same test. */
export async function isCrewBoard(projectId: string): Promise<boolean> {
  const [link] = await db.select({ id: crewBoards.id }).from(crewBoards).where(eq(crewBoards.shadowProjectId, projectId))
  if (link) return true
  const [own] = await db.select({ id: crews.id }).from(crews).where(eq(crews.boardId, projectId))
  return Boolean(own)
}

/**
 * Seats the crew's own accounts that the forks have not already taken. An own account whose key a seated person
 * already holds is that same person: it gets no desk of its own, and its tasks are read at the seated person's desk
 * (`aliases` maps the own account's id to the seated person's id). Without this, a card assigned to the own account
 * gave the office a second, guest desk for one person.
 */
export function seatOwnAccounts(
  seated: OfficePerson[],
  accounts: { id: string, email: string, name: string }[],
  forkIds: ReadonlySet<string>,
  keyOf: (email: string) => string
): { added: OfficePerson[], aliases: Record<string, string> } {
  const added: OfficePerson[] = []
  const aliases: Record<string, string> = {}
  const holders = new Map(seated.map(p => [p.key, p.userId]))
  for (const account of accounts) {
    if (forkIds.has(account.id) || !account.email) continue
    const key = keyOf(account.email)
    if (OUTSIDE_KEYS.has(key)) continue
    const holder = holders.get(key)
    if (holder !== undefined) {
      if (holder !== account.id) aliases[account.id] = holder
      continue
    }
    const person: OfficePerson = { userId: account.id, key, name: account.name, role: roleOfKey(key) }
    added.push(person)
    holders.set(key, account.id)
  }
  return { added, aliases }
}

/** The office's people for `projectId`, names only (never an address), Pia first and the Boss last. */
export async function officeCastOf(projectId: string, assigneeIds: string[]): Promise<{ crewName: string | null, cast: OfficePerson[], seats: Record<string, string> }> {
  const cast: OfficePerson[] = []
  const add = (userId: string, key: string, name: string) => {
    if (OUTSIDE_KEYS.has(key) || cast.some(p => p.userId === userId || p.key === key)) return
    cast.push({ userId, key, name, role: roleOfKey(key) })
  }

  const [link] = await db.select().from(crewBoards).where(eq(crewBoards.shadowProjectId, projectId))
  const [crew] = link
    ? await db.select().from(crews).where(eq(crews.id, link.crewId))
    : await db.select().from(crews).where(eq(crews.boardId, projectId))

  let seats: Record<string, string> = {}
  if (crew) {
    if (link) {
      const forks = await db
        .select({ userId: crewBoardMembers.userId, key: crewBoardMembers.personKey, name: user.name })
        .from(crewBoardMembers)
        .innerJoin(user, eq(user.id, crewBoardMembers.userId))
        .where(eq(crewBoardMembers.linkId, link.id))
      for (const fork of forks) add(fork.userId, fork.key, fork.name)
    }
    // The crew's own accounts fill whatever the forks leave open: Boss always, everyone when not forked.
    // Forks are crew accounts too, so they are left out here: a fork for another board works elsewhere.
    const accounts = await db.select({ id: user.id, email: user.email, name: user.name }).from(user).where(eq(user.crewId, crew.id))
    const forkRows = accounts.length
      ? await db.select({ userId: crewBoardMembers.userId }).from(crewBoardMembers).where(inArray(crewBoardMembers.userId, accounts.map(a => a.id)))
      : []
    const forkIds = new Set(forkRows.map(r => r.userId))
    const seating = seatOwnAccounts(cast, accounts, forkIds, email => personKeyOf(crew.slug, email))
    cast.push(...seating.added)
    seats = seating.aliases
  }

  const strangers = [...new Set(assigneeIds)].filter(id => !cast.some(p => p.userId === id) && !seats[id])
  if (strangers.length) {
    const rows = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, strangers))
    for (const row of rows) cast.push({ userId: row.id, key: `u-${row.id}`, name: row.name, role: 'worker' })
  }

  // Role first, then key: the forks come back in no fixed order, so the seats must not depend on it.
  cast.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.key.localeCompare(b.key))
  return { crewName: crew?.name ?? null, cast, seats }
}
