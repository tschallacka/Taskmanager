// The person card: what one person may see of another. Only people who share a board are found, an
// address is shown to the people who work on a board with them, and on a board the viewer only reads as a
// guest, what is marked private does not exist. Needs the dev database and the Nuxt aliases. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/person-card.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const { member, organization, projectColumns, projectGuests, projectTasks, projects, user } = await import('../server/db/schema')
const { personView } = await import('../server/utils/personCard')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tpc-${tag}-${name}`
const now = Date.now()

const owner = id('owner')
const plain = id('plain')
const guest = id('guest')
const stranger = id('stranger')
const team = id('team')
const board = id('board')
const column = id('column')
const users = [owner, plain, guest, stranger]

before(async () => {
  const at = new Date()
  await db.insert(user).values(users.map(u => ({ id: u, name: `Name ${u}`, email: `${u}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at })))
  await db.insert(organization).values({ id: team, name: 'Card team', slug: team, createdAt: at })
  await db.insert(member).values([
    { id: id('m1'), organizationId: team, userId: owner, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: team, userId: plain, role: 'member', createdAt: at }
  ])
  await db.insert(projects).values({ id: board, userId: owner, teamId: team, name: 'Card board', createdAt: now, updatedAt: now })
  await db.insert(projectColumns).values({ id: column, projectId: board, name: 'To do', position: 0, createdAt: now })
  const task = (name: string, extra: Partial<typeof projectTasks.$inferInsert>, position: number) =>
    ({ id: id(name), projectId: board, columnId: column, title: name, assigneeId: plain, visibility: 'internal' as const, position, createdAt: now, updatedAt: now, ...extra })
  await db.insert(projectTasks).values([
    task('internal', {}, 0),
    task('shared', { visibility: 'customer' }, 1000),
    task('finished', { completedAt: now }, 2000),
    task('trashed', { deletedAt: now }, 3000),
    task('someone-else', { assigneeId: owner }, 4000)
  ])
  await db.insert(projectTasks).values({ ...task('subtask', {}, 5000), parentTaskId: id('internal') })
  await db.insert(projectGuests).values({ id: id('g1'), projectId: board, userId: guest, role: 'editor', allowedDomain: null, addedBy: owner, createdAt: now })
})

after(async () => {
  await db.delete(projects).where(eq(projects.id, board))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, users))
  await db.$client.end()
})

test('a teammate sees the shared board, the address and every open task assigned to the person', async () => {
  const view = await personView(owner, plain)
  assert.ok(view)
  assert.deepEqual(view.boards.map(b => [b.id, b.staff]), [[board, true]])
  assert.equal(view.person.email, `${plain}@staff.test`)
  assert.deepEqual(view.tasks.map(t => t.id).sort(), [id('internal'), id('shared')].sort())
})

test('finished, trashed and sub tasks and tasks of someone else are left out', async () => {
  const ids = (await personView(owner, plain))!.tasks.map(t => t.id)
  for (const name of ['finished', 'trashed', 'someone-else', 'subtask']) assert.ok(!ids.includes(id(name)), `${name} must not be listed`)
})

test('a person who shares no board is not found, and neither is an unknown id', async () => {
  assert.equal(await personView(stranger, owner), null)
  assert.equal(await personView(owner, stranger), null)
  assert.equal(await personView(owner, id('nobody')), null)
})

test('a person always sees their own card, boards or not', async () => {
  const view = await personView(stranger, stranger)
  assert.ok(view)
  assert.equal(view.person.email, `${stranger}@staff.test`)
  assert.deepEqual(view.boards, [])
})

test('a guest sees the board as a reader: no address and no private task', async () => {
  const view = await personView(guest, plain)
  assert.ok(view, 'a guest and a team member share the board')
  assert.deepEqual(view.boards.map(b => [b.id, b.staff]), [[board, false]])
  assert.equal(view.person.email, null)
  assert.deepEqual(view.tasks.map(t => t.id), [id('shared')])
})
