// The Archive, Unarchive and Empty queries, run against a recording fake database. Each query's where clause is rendered
// with drizzle's Postgres dialect, so the test sees the SQL and its parameters: every change is bound to the signed-in
// person's id, a dry run deletes nothing, and archive and unarchive touch only the rows they should. No database.
//   node --import tsx --test tests/notifications-box-queries.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PgDialect } from 'drizzle-orm/pg-core'
import { archiveNotifications, emptyReadBox, unarchiveNotifications } from '../server/utils/notificationBox'
import type { NotificationsDb } from '../server/utils/notificationBox'

const DAY = 86_400_000
const NOW = 1_800_000_000_000
const dialect = new PgDialect()

type Call = { op: 'select' | 'update' | 'delete', where: unknown, values?: Record<string, unknown> }

/** A fake of the drizzle calls the queries make. It records each mutation and answers with the given counts. */
function fakeDb(answers: { total?: number, rows?: { id: string }[] } = {}) {
  const calls: Call[] = []
  const rows = answers.rows ?? []
  const database = {
    select: () => ({
      from: () => ({
        where: (where: unknown) => {
          calls.push({ op: 'select', where })
          return Promise.resolve([{ total: answers.total ?? 0 }])
        }
      })
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: unknown) => {
          calls.push({ op: 'update', where, values })
          return { returning: () => Promise.resolve(rows) }
        }
      })
    }),
    delete: () => ({
      where: (where: unknown) => {
        calls.push({ op: 'delete', where })
        return { returning: () => Promise.resolve(rows) }
      }
    })
  }
  return { database: database as unknown as NotificationsDb, calls }
}

/** The SQL text and its parameters for a where clause, as Postgres would receive them. */
function render(where: unknown) {
  return dialect.sqlToQuery(where as Parameters<PgDialect['sqlToQuery']>[0])
}

test('a dry run counts what would go and deletes nothing', async () => {
  const { database, calls } = fakeDb({ total: 3 })
  const result = await emptyReadBox(database, 'alice', { all: true, days: null, dryRun: true }, NOW)
  assert.deepEqual(result, { count: 3 })
  assert.deepEqual(calls.map(call => call.op), ['select'])
})

test('emptying all deletes only the signed-in person archived notifications', async () => {
  const { database, calls } = fakeDb({ rows: [{ id: 'n1' }, { id: 'n2' }] })
  const result = await emptyReadBox(database, 'alice', { all: true, days: null, dryRun: false }, NOW)
  assert.deepEqual(result, { deleted: 2 })
  assert.deepEqual(calls.map(call => call.op), ['delete'])
  const { sql, params } = render(calls[0].where)
  assert.match(sql, /"user_id" = \$1/)
  assert.match(sql, /"archived_at" is not null/i)
  assert.doesNotMatch(sql, /"archived_at" </)
  assert.deepEqual(params, ['alice'])
})

test('emptying older than an age cuts at now minus that many days, and stays bound to the person', async () => {
  const { database, calls } = fakeDb({ rows: [] })
  await emptyReadBox(database, 'alice', { all: false, days: 30, dryRun: false }, NOW)
  const { sql, params } = render(calls[0].where)
  assert.match(sql, /"archived_at" < \$2/)
  assert.deepEqual(params, ['alice', NOW - 30 * DAY])
})

test('a dry run for an age uses the same person-bound clause as the delete', async () => {
  const { database, calls } = fakeDb({ total: 0 })
  await emptyReadBox(database, 'alice', { all: false, days: 182, dryRun: true }, NOW)
  const { params } = render(calls[0].where)
  assert.deepEqual(params, ['alice', NOW - 182 * DAY])
})

test('archive changes only the signed-in person unarchived notifications, and marks them read', async () => {
  const { database, calls } = fakeDb({ rows: [{ id: 'n1' }] })
  const result = await archiveNotifications(database, 'alice', { ids: ['n1', 'n9'], all: false }, NOW)
  assert.deepEqual(result, { archived: 1 })
  assert.equal(calls[0].op, 'update')
  assert.equal(calls[0].values?.archivedAt, NOW)
  const { sql, params } = render(calls[0].where)
  assert.match(sql, /"user_id" = \$1/)
  assert.match(sql, /"archived_at" is null/i)
  assert.match(sql, /"id" in \(\$2, \$3\)/)
  assert.deepEqual(params, ['alice', 'n1', 'n9'])
})

test('archive all touches every unarchived notification of the signed-in person, and no other id', async () => {
  const { database, calls } = fakeDb({ rows: [] })
  await archiveNotifications(database, 'alice', { ids: [], all: true }, NOW)
  const { sql, params } = render(calls[0].where)
  assert.match(sql, /"user_id" = \$1/)
  assert.match(sql, /"archived_at" is null/i)
  assert.doesNotMatch(sql, /"id" in/)
  assert.deepEqual(params, ['alice'])
})

test('unarchive moves back only the signed-in person archived notifications with the given ids', async () => {
  const { database, calls } = fakeDb({ rows: [{ id: 'n1' }] })
  const result = await unarchiveNotifications(database, 'alice', ['n1'])
  assert.deepEqual(result, { unarchived: 1 })
  assert.equal(calls[0].op, 'update')
  assert.equal(calls[0].values?.archivedAt, null)
  const { sql, params } = render(calls[0].where)
  assert.match(sql, /"user_id" = \$1/)
  assert.match(sql, /"archived_at" is not null/i)
  assert.match(sql, /"id" in \(\$2\)/)
  assert.deepEqual(params, ['alice', 'n1'])
})
