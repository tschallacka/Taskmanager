// The project Time view's week range (card mwj6tfijrwm88ur7iaf): entries in three weeks, on the first and last day of
// each week, and logged in the first and last hour of a day in a zone away from UTC, must come back for their own week
// and only for it. Needs the test database and the Nuxt aliases. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wren node --import tsx --test --test-force-exit tests/time-view-weeks.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq } from 'drizzle-orm'

Object.assign(globalThis, { createError })
process.env.TZ = 'America/New_York'

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { member, organization, projectColumns, projectTasks, projects, timeEntries, user } = schema
const { entriesWhere, loadEntries, parseRange } = await import('../server/utils/timeTracking')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tvw-${tag}-${name}`
const now = Date.now()
const owner = id('owner')
const team = id('team')
const board = id('board')
const column = id('column')
const task = id('task')

// Monday-to-Sunday weeks: 2026-10-26, 2026-11-02, 2026-11-09. Each entry: its own day, and a created time in the zone.
const entries = [
  { day: '2026-10-26', at: '2026-10-26T00:10:00-04:00', minutes: 30 }, // Monday, first hour (EDT)
  { day: '2026-11-01', at: '2026-11-01T23:50:00-04:00', minutes: 45 }, // Sunday, last hour
  { day: '2026-11-02', at: '2026-11-02T00:20:00-05:00', minutes: 20 }, // Monday after the DST change, first hour
  { day: '2026-11-08', at: '2026-11-08T23:40:00-05:00', minutes: 60 }, // Sunday, last hour
  { day: '2026-11-09', at: '2026-11-09T00:05:00-05:00', minutes: 15 }, // Monday, first hour
  { day: '2026-11-15', at: '2026-11-15T23:59:00-05:00', minutes: 90 } // Sunday, last minute
].map((e, i) => ({ ...e, id: id(`e${i}`) }))

before(async () => {
  const at = new Date()
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values({ id: team, name: 'Time team', slug: team, createdAt: at })
  await db.insert(member).values({ id: id('m1'), organizationId: team, userId: owner, role: 'owner', createdAt: at })
  await db.insert(projects).values({ id: board, userId: owner, teamId: team, name: 'Time board', createdAt: now, updatedAt: now })
  await db.insert(projectColumns).values({ id: column, projectId: board, name: 'To do', position: 0, createdAt: now })
  await db.insert(projectTasks).values({ id: task, projectId: board, columnId: column, title: 'Task', position: 0, createdAt: now, updatedAt: now })
  await db.insert(timeEntries).values(entries.map(e => ({
    id: e.id, taskId: task, projectId: board, userId: owner, minutes: e.minutes, day: e.day, note: '', createdAt: Date.parse(e.at)
  })))
})

after(async () => {
  await db.delete(timeEntries).where(eq(timeEntries.projectId, board))
  await db.delete(projects).where(eq(projects.id, board))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(eq(user.id, owner))
  await db.$client.end()
})

// What the route returns for a week: the same parse and filter as server/api/projects/[id]/time.get.ts.
async function weekOf(from: string, to: string) {
  const range = parseRange(from, to)
  const rows = await loadEntries(entriesWhere({ projectIds: [board], from: range.from, to: range.to }))
  return rows.map(row => row.id).sort()
}

const idsOn = (days: string[]) => entries.filter(e => days.includes(e.day)).map(e => e.id).sort()

test('each week returns its own entries, including the first and last day of the week', async () => {
  assert.deepEqual(await weekOf('2026-10-26', '2026-11-01'), idsOn(['2026-10-26', '2026-11-01']))
  assert.deepEqual(await weekOf('2026-11-02', '2026-11-08'), idsOn(['2026-11-02', '2026-11-08']))
  assert.deepEqual(await weekOf('2026-11-09', '2026-11-15'), idsOn(['2026-11-09', '2026-11-15']))
})

test('a week never returns the entries of the next or the previous week', async () => {
  const middle = await weekOf('2026-11-02', '2026-11-08')
  assert.equal(middle.length, 2)
  assert.equal(entries.filter(e => e.day === '2026-11-01' || e.day === '2026-11-09').every(e => !middle.includes(e.id)), true)
})

test('an entry logged in the first or last hour of a day keeps the day it was logged for', async () => {
  const rows = await loadEntries(entriesWhere({ projectIds: [board] }))
  for (const e of entries) {
    const row = rows.find(r => r.id === e.id)
    assert.equal(row?.day, e.day, `entry ${e.day} at ${e.at} keeps its day`)
  }
})
