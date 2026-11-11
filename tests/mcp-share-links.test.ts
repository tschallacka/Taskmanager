// The links an agent hands to a person (server/utils/shareLinks.ts): absolute, on the configured origin, and on the paths
// the app's routes use. get_task answers with its task's link. Needs the test database and the Nuxt aliases:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test --test-force-exit tests/mcp-share-links.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { projects, projectColumns, projectTasks, user } = schema
const { boardShareUrl, taskShareUrl, updateShareUrl } = await import('../server/utils/shareLinks')
const { MCP_TOOLS } = await import('../server/utils/mcpRegistry')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tsl-${tag}-${name}`
const owner = id('owner')
const board = id('board')
const column = id('column')
const task = `tslt${tag}`
const origin = 'https://tasks.example.test'
const saved = process.env.BETTER_AUTH_URL

before(async () => {
  process.env.BETTER_AUTH_URL = origin
  const at = new Date()
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })
  const now = Date.now()
  await db.insert(projects).values({ id: board, userId: owner, name: 'Share board', createdAt: now, updatedAt: now })
  await db.insert(projectColumns).values({ id: column, projectId: board, name: 'To do', position: 0, createdAt: now })
  await db.insert(projectTasks).values({ id: task, projectId: board, columnId: column, title: 'Share me', visibility: 'internal', position: 0, createdAt: now, updatedAt: now })
})

after(async () => {
  await db.delete(projectTasks).where(eq(projectTasks.id, task))
  await db.delete(projectColumns).where(eq(projectColumns.id, column))
  await db.delete(projects).where(eq(projects.id, board))
  await db.delete(user).where(inArray(user.id, [owner]))
  if (saved === undefined) delete process.env.BETTER_AUTH_URL
  else process.env.BETTER_AUTH_URL = saved
  await db.$client.end()
})

test('the links are absolute on the configured origin and use the app routes', () => {
  assert.equal(boardShareUrl('b1'), `${origin}/projects/b1`)
  assert.equal(taskShareUrl('b1', 't1'), `${origin}/projects/b1?task=t1`)
  assert.equal(updateShareUrl('b1', 't1', 'u1'), `${origin}/projects/b1?task=t1&comment=u1`)
})

test('the origin has no trailing slash, and falls back to localhost without the setting', () => {
  process.env.BETTER_AUTH_URL = `${origin}/`
  assert.equal(boardShareUrl('b1'), `${origin}/projects/b1`)
  delete process.env.BETTER_AUTH_URL
  assert.equal(boardShareUrl('b1'), 'http://localhost:3000/projects/b1')
  process.env.BETTER_AUTH_URL = origin
})

test('get_task answers with the task\'s link to share', async () => {
  const context = {
    keyId: 'k',
    keyName: 'k',
    userId: owner,
    teamId: null,
    customerId: null,
    projectId: null,
    scopes: ['boards:read'] as ('boards:read' | 'boards:write')[],
    reach: { allBoards: true, workspaceTeamIds: [], boardIds: [] },
    memberTeamIds: []
  }
  const tool = MCP_TOOLS.find(t => t.name === 'get_task')!
  const answer = await tool.handler({ id: task }, context) as { url?: string }
  assert.equal(answer.url, `${origin}/projects/${board}?task=${task}`)
})
