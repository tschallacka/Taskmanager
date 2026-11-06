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

/** The office's people for `projectId`, names only (never an address), Pia first and the Boss last. */
export async function officeCastOf(projectId: string, assigneeIds: string[]): Promise<{ crewName: string | null, cast: OfficePerson[] }> {
  const cast: OfficePerson[] = []
  const add = (userId: string, key: string, name: string) => {
    if (OUTSIDE_KEYS.has(key) || cast.some(p => p.userId === userId || p.key === key)) return
    cast.push({ userId, key, name, role: roleOfKey(key) })
  }

  const [link] = await db.select().from(crewBoards).where(eq(crewBoards.shadowProjectId, projectId))
  const [crew] = link
    ? await db.select().from(crews).where(eq(crews.id, link.crewId))
    : await db.select().from(crews).where(eq(crews.boardId, projectId))

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
    for (const account of accounts) {
      if (forkIds.has(account.id) || !account.email) continue
      add(account.id, personKeyOf(crew.slug, account.email), account.name)
    }
  }

  const strangers = [...new Set(assigneeIds)].filter(id => !cast.some(p => p.userId === id))
  if (strangers.length) {
    const rows = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, strangers))
    for (const row of rows) cast.push({ userId: row.id, key: `u-${row.id}`, name: row.name, role: 'worker' })
  }

  cast.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
  return { crewName: crew?.name ?? null, cast }
}
