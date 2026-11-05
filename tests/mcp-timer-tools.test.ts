// The MCP timer tools: start_timer, stop_timer and the note a stopped timer logs. Needs the dev
// database and the Nuxt aliases. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/mcp-timer-tools.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { member, organization, projectColumns, projectTasks, projects, timeEntries, timeTimers, user } = schema
const { MCP_TIME_TOOLS } = await import('../server/utils/mcpTimeTools')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tmt-${tag}-${name}`
const now = Date.now()

const owner = id('owner')
const team = id('team')
const board = id('board')
const column = id('column')
const taskA = id('task-a')
const taskB = id('task-b')

const context = { keyId: id('key'), keyName: 'timer test', userId: owner, teamId: team, customerId: null, projectId: null, scopes: ['boards:read', 'boards:write'] } as never
const tool = (name: string) => MCP_TIME_TOOLS.find(candidate => candidate.name === name)!

before(async () => {
  const at = new Date()
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values({ id: team, name: 'Timer team', slug: team, createdAt: at })
  await db.insert(member).values({ id: id('m1'), organizationId: team, userId: owner, role: 'owner', createdAt: at })
  await db.insert(projects).values({ id: board, userId: owner, teamId: team, name: 'Timer board', createdAt: now, updatedAt: now })
  await db.insert(projectColumns).values({ id: column, projectId: board, name: 'To do', position: 0, createdAt: now })
  await db.insert(projectTasks).values([
    { id: taskA, projectId: board, columnId: column, title: 'Task A', position: 0, createdAt: now, updatedAt: now },
    { id: taskB, projectId: board, columnId: column, title: 'Task B', position: 1000, createdAt: now, updatedAt: now }
  ])
})

after(async () => {
  await db.delete(timeTimers).where(eq(timeTimers.userId, owner))
  await db.delete(timeEntries).where(eq(timeEntries.userId, owner))
  await db.delete(projects).where(eq(projects.id, board))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(eq(user.id, owner))
  await db.$client.end()
})

test('the timer tools exist, write to boards and log under the time resource', () => {
  for (const name of ['start_timer', 'stop_timer']) {
    assert.equal(tool(name).scope, 'boards:write', name)
    assert.equal(tool(name).readOnly, false, name)
    assert.equal(tool(name).resource, 'time', name)
  }
})

test('stopping with nothing running is not an error', async () => {
  assert.deepEqual(await tool('stop_timer').handler({}, context), { stopped: false })
})

test('start_timer starts one timer, and starting another stops and logs the first', async () => {
  const first = await tool('start_timer').handler({ task: taskA }, context) as { started: boolean, stopped?: unknown }
  assert.equal(first.started, true)
  assert.equal(first.stopped, undefined)

  const second = await tool('start_timer').handler({ task: taskB }, context) as { stopped?: { minutes: number } }
  assert.ok(second.stopped, 'the first timer was stopped to make room')
  assert.equal(second.stopped!.minutes, 1, 'a timer is logged at one minute at least')
  const timers = await db.select().from(timeTimers).where(eq(timeTimers.userId, owner))
  assert.deepEqual(timers.map(timer => timer.taskId), [taskB])
})

test('stop_timer logs the running timer with its note, and nothing keeps running', async () => {
  const stopped = await tool('stop_timer').handler({ note: 'triage' }, context) as { stopped: boolean, entry: { taskId: string, note: string } }
  assert.equal(stopped.stopped, true)
  assert.equal(stopped.entry.taskId, taskB)
  assert.equal(stopped.entry.note, 'triage')
  assert.equal((await db.select().from(timeTimers).where(eq(timeTimers.userId, owner))).length, 0)
})
