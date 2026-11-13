// The comments route with a permalink window: GET /api/tasks/:id/comments?around=<id>, ?before=<id>, ?after=<id>.
// Runs the route's own handler against a seeded thread on the database: the window at the start, the middle and the
// end of a thread, the counts, load earlier and load later, and an unknown id giving 404. Staff reader only; the
// customer's view is counted over shared comments by the helper test (tests/comment-window.test.ts).
// Run: TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test tests/comment-window-route.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createEvent, createError, getQuery, getRouterParam, readBody } from 'h3'
import { eq, inArray } from 'drizzle-orm'

// Nitro provides these as globals; the route file uses them without importing.
Object.assign(globalThis, {
  createError,
  getQuery,
  getRouterParam,
  readBody,
  defineEventHandler: (fn: unknown) => fn
})

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const handler = (await import('../server/api/tasks/[id]/comments.ts')).default as (event: unknown) => Promise<unknown>
const { organization, member, projects, projectColumns, projectTasks, taskComments, user } = schema

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `cwr-${tag}-${name}`
const now = Date.now()

const owner = id('owner')
const team = id('team')
const board = id('board')
const column = id('column')
const task = id('task')
const COUNT = 12
const commentIds = Array.from({ length: COUNT }, (_, i) => id(`c${i + 1}`))

// An event for the route: the signed-in user and their active team, with a query string.
function eventFor(query: string) {
  const event = createEvent(({ method: 'GET', url: `/api/tasks/${task}/comments${query}`, headers: {} } as never), ({} as never))
  ;(event as unknown as { context: Record<string, unknown> }).context.params = { id: task }
  ;(event as unknown as { context: Record<string, unknown> }).context.session = {
    user: { id: owner },
    session: { activeOrganizationId: team }
  }
  return event
}

type Row = { id: string }
const ids = (rows: Row[]) => rows.map(row => row.id.replace(`cwr-${tag}-`, ''))

before(async () => {
  const at = new Date()
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values({ id: team, name: team, slug: team, createdAt: at })
  await db.insert(member).values({ id: id('m1'), organizationId: team, userId: owner, role: 'owner', createdAt: at })
  await db.insert(projects).values({ id: board, userId: owner, teamId: team, name: 'Window board', createdAt: now, updatedAt: now })
  await db.insert(projectColumns).values({ id: column, projectId: board, name: 'To do', position: 0, createdAt: now })
  await db.insert(projectTasks).values({ id: task, projectId: board, columnId: column, title: 'Window task', position: 0, createdAt: now, updatedAt: now, visibility: 'internal' } as never)
  await db.insert(taskComments).values(commentIds.map((commentId, i) => ({
    id: commentId,
    taskId: task,
    userId: owner,
    body: `comment ${i + 1}`,
    visibility: 'internal',
    createdVia: 'ui',
    createdAt: now + i
  })) as never)
})

after(async () => {
  await db.delete(taskComments).where(inArray(taskComments.id, commentIds))
  await db.delete(projectTasks).where(eq(projectTasks.id, task))
  await db.delete(projectColumns).where(eq(projectColumns.id, column))
  await db.delete(projects).where(eq(projects.id, board))
  await db.delete(member).where(eq(member.organizationId, team))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(eq(user.id, owner))
})

type Window = { comments: Row[], hasEarlier: boolean, earlierCount: number, hasLater: boolean, laterCount: number }

test('no window query: the whole thread comes back, as before', async () => {
  const rows = await handler(eventFor('')) as Row[]
  assert.equal(Array.isArray(rows), true)
  assert.equal(rows.length, COUNT)
})

test('around the 6th of 12: the comment with 5 either side, and nothing left before it', async () => {
  const w = await handler(eventFor(`?around=${commentIds[5]}`)) as Window
  assert.deepEqual(ids(w.comments), ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11'])
  assert.equal(w.hasEarlier, false)
  assert.equal(w.earlierCount, 0)
  assert.equal(w.hasLater, true)
  assert.equal(w.laterCount, 1)
})

test('around the last comment: 5 before it, and nothing after', async () => {
  const w = await handler(eventFor(`?around=${commentIds[11]}`)) as Window
  assert.deepEqual(ids(w.comments), ['c7', 'c8', 'c9', 'c10', 'c11', 'c12'])
  assert.equal(w.hasLater, false)
  assert.equal(w.laterCount, 0)
  assert.equal(w.hasEarlier, true)
  assert.equal(w.earlierCount, 6)
})

test('load earlier of the 8th: every comment before it, none after', async () => {
  const w = await handler(eventFor(`?before=${commentIds[7]}`)) as Window
  assert.deepEqual(ids(w.comments), ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'])
  assert.equal(w.hasEarlier, false)
  assert.equal(w.hasLater, true)
  assert.equal(w.laterCount, 5)
})

test('show later of the 8th: every comment after it, none before', async () => {
  const w = await handler(eventFor(`?after=${commentIds[7]}`)) as Window
  assert.deepEqual(ids(w.comments), ['c9', 'c10', 'c11', 'c12'])
  assert.equal(w.hasLater, false)
  assert.equal(w.hasEarlier, true)
  assert.equal(w.earlierCount, 8)
})

test('an unknown comment id is a 404', async () => {
  await assert.rejects(handler(eventFor('?around=no-such-comment')), (e: { statusCode?: number }) => e.statusCode === 404)
  await assert.rejects(handler(eventFor('?before=no-such-comment')), (e: { statusCode?: number }) => e.statusCode === 404)
})
