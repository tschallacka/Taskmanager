// The Read box against the real database: emptying by age cuts at 30 days (29 days old stays, 31 days old goes), a dry
// run counts the same rows the delete removes, and a second person's ids and "all" never touch another person's rows.
// The archived_at times are set by the test's own insert, not by hand in a shell. Needs the test database with the
// notifications table. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wick node --import tsx --test --test-force-exit tests/notifications-archive-db.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const { notifications, projects, user } = await import('../server/db/schema')
const { archiveNotifications, emptyReadBox, unarchiveNotifications } = await import('../server/utils/notificationBox')

const DAY = 86_400_000
const tag = randomBytes(4).toString('hex')
const id = (name: string) => `nab-${tag}-${name}`
const alice = id('alice')
const bob = id('bob')
const projectId = id('project')
const now = Date.now()
const at = new Date()

const aged = {
  archived29: id('n-archived-29'), // archived 29 days ago: kept by the 30-day empty
  archived31: id('n-archived-31'), // archived 31 days ago: removed by the 30-day empty
  archivedNow: id('n-archived-now'), // archived just now: kept
  inbox31: id('n-inbox-31') // in the inbox, old: never part of the Read box
}
const bobRows = { archived: id('b-archived'), inbox: id('b-inbox') }

function row(rowId: string, userId: string, archivedAt: number | null, readAt: number | null) {
  return {
    id: rowId,
    userId,
    type: 'comment' as const,
    projectId,
    title: 'test',
    body: '',
    createdAt: now,
    readAt,
    archivedAt
  }
}

async function present(ids: string[]) {
  const found = await db.select({ id: notifications.id }).from(notifications).where(inArray(notifications.id, ids))
  return new Set(found.map(item => item.id))
}

before(async () => {
  await db.insert(user).values([
    { id: alice, name: alice, email: `${alice}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at },
    { id: bob, name: bob, email: `${bob}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at }
  ])
  await db.insert(projects).values({ id: projectId, userId: alice, name: 'archive db test', createdAt: now, updatedAt: now })
  await db.insert(notifications).values([
    row(aged.archived29, alice, now - 29 * DAY, now - 29 * DAY),
    row(aged.archived31, alice, now - 31 * DAY, now - 31 * DAY),
    row(aged.archivedNow, alice, now, now),
    row(aged.inbox31, alice, null, now - 31 * DAY),
    row(bobRows.archived, bob, now - 31 * DAY, now - 31 * DAY),
    row(bobRows.inbox, bob, null, null)
  ])
})

after(async () => {
  await db.delete(user).where(inArray(user.id, [alice, bob]))
})

test('emptying older than 30 days: the 29-day row stays, the 31-day row goes, and the dry run counts the same', async () => {
  const dry = await emptyReadBox(db, alice, { all: false, days: 30, dryRun: true }, now)
  assert.deepEqual(dry, { count: 1 })
  const real = await emptyReadBox(db, alice, { all: false, days: 30, dryRun: false }, now)
  assert.deepEqual(real, { deleted: 1 })
  const left = await present([aged.archived29, aged.archived31, aged.archivedNow, aged.inbox31])
  assert.equal(left.has(aged.archived31), false)
  assert.equal(left.has(aged.archived29), true)
  assert.equal(left.has(aged.archivedNow), true)
  assert.equal(left.has(aged.inbox31), true, 'an inbox row is never in the Read box')
})

test('a second person cannot archive, unarchive or empty the first person rows, and their own rows are untouched', async () => {
  const archiveIds = await archiveNotifications(db, bob, { ids: [aged.inbox31, aged.archivedNow], all: false }, now)
  assert.deepEqual(archiveIds, { archived: 0 })

  const unarchiveIds = await unarchiveNotifications(db, bob, [aged.archivedNow])
  assert.deepEqual(unarchiveIds, { unarchived: 0 })

  const bobAll = await archiveNotifications(db, bob, { ids: [], all: true }, now)
  assert.deepEqual(bobAll, { archived: 1 }, 'archive all archives only bob inbox row')
  const aliceInbox = await present([aged.inbox31])
  assert.equal(aliceInbox.has(aged.inbox31), true)

  const bobEmpty = await emptyReadBox(db, bob, { all: true, days: null, dryRun: false }, now)
  assert.deepEqual(bobEmpty, { deleted: 2 }, 'bob empties his two Read box rows, the old one and the one just archived')
  const alicePresent = await present([aged.archived29, aged.archivedNow, aged.inbox31])
  assert.equal(alicePresent.size, 3, 'alice rows are all still there')
})

test('emptying all for the first person leaves the second person rows alone', async () => {
  const deleted = await emptyReadBox(db, alice, { all: true, days: null, dryRun: false }, now)
  assert.deepEqual(deleted, { deleted: 2 }, 'alice Read box holds the 29-day and the just-archived row')
  const aliceLeft = await present([aged.archived29, aged.archivedNow, aged.inbox31])
  assert.equal(aliceLeft.size, 1, 'only the inbox row stays')
  assert.equal(aliceLeft.has(aged.inbox31), true)
})
