// A comment that names someone with @name leaves a stored "mention" in that person's inbox, but only
// if they are on the board, and without needing an agent of theirs to be listening. Needs the dev
// database and the Nuxt aliases. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/mention-notifications.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { member, notifications, organization, projectColumns, projectTasks, projects, user } = await import('../server/db/schema')
const { notifyComment } = await import('../server/utils/notifyEvents')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `mnt-${tag}-${name}`
const now = Date.now()

const author = id('author')
const mentioned = id('mentioned')
const bystander = id('bystander')
const outsider = id('outsider')
const team = id('team')
const board = id('board')
const column = id('column')
const task = id('task')

// First names are unique to this run, so a mention matches one person only.
const firstName = (key: string) => `${key}${tag}`

const project = { id: board, name: 'Mention board', userId: author, teamId: team, customerId: null }
const card = { id: task, title: 'Mention card', visibility: 'internal' as const, assigneeId: bystander, createdBy: author }

const inbox = async (userId: string) => (await db.select().from(notifications).where(eq(notifications.userId, userId))).map(row => ({ type: row.type, title: row.title }))

before(async () => {
  const at = new Date()
  for (const [key, userId] of [['author', author], ['mentioned', mentioned], ['bystander', bystander], ['outsider', outsider]] as const) {
    await db.insert(user).values({ id: userId, name: `${firstName(key)} Test`, email: `${userId}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at })
  }
  await db.insert(organization).values({ id: team, name: 'Mention team', slug: team, createdAt: at })
  for (const userId of [author, mentioned, bystander]) {
    await db.insert(member).values({ id: id(`m-${userId}`), organizationId: team, userId, role: 'member', createdAt: at })
  }
  await db.insert(projects).values({ id: board, userId: author, teamId: team, name: 'Mention board', createdAt: now, updatedAt: now })
  await db.insert(projectColumns).values({ id: column, projectId: board, name: 'To do', position: 0, createdAt: now })
  await db.insert(projectTasks).values({ id: task, projectId: board, columnId: column, title: 'Mention card', position: 0, createdAt: now, updatedAt: now, assigneeId: bystander, createdBy: author })
})

after(async () => {
  await db.delete(projects).where(eq(projects.id, board))
  await db.delete(organization).where(eq(organization.id, team))
  for (const userId of [author, mentioned, bystander, outsider]) await db.delete(user).where(eq(user.id, userId))
  await db.$client.end()
})

test('a member the comment names gets a stored mention, not a plain comment notice', async () => {
  await notifyComment(project, card, author, `Over to @${firstName('mentioned')}, please look`, false)
  const rows = await inbox(mentioned)
  assert.deepEqual(rows.map(row => row.type), ['mention'])
  assert.match(rows[0]!.title, /mentioned you on "Mention card"/)
})

test('a person the comment does not name keeps the plain comment notice', async () => {
  assert.deepEqual((await inbox(bystander)).map(row => row.type), ['comment'])
})

test('the author is told nothing about their own comment', async () => {
  assert.deepEqual(await inbox(author), [])
})

test('someone who is not on the board is not told, even when the name matches', async () => {
  await notifyComment(project, card, author, `Cc @${firstName('outsider')}`, false)
  assert.deepEqual(await inbox(outsider), [])
})
