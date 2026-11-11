// Sprocket as a customer contact: its run is limited to the customer, so the MCP tools show it what a contact may see and
// nothing team-only. A shared card and its shared comment come back; a team-only card is not found by search or by id; a
// team-only comment on the shared card is not shown. Needs the test database. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wynn node --import tsx --test --test-force-exit tests/sprocket-customer.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { sprocketRunContext, runSprocketTool } = await import('../server/utils/sprocketRun')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `spc-${tag}-${name}`
const now = new Date()
const ms = Date.now()

const staff = id('staff')
const contact = id('contact')
const team = id('team')
const customer = id('customer')
const project = id('project')
const column = id('column')
const sharedTask = id('task-shared')
const teamTask = id('task-team')
const sharedComment = id('comment-shared')
const teamComment = id('comment-team')
const teamWord = `teamonly${tag}`

before(async () => {
  await db.insert(schema.user).values([staff, contact].map((userId, i) => ({
    id: userId,
    name: i ? 'Contact' : 'Staff',
    email: `${userId}@example.test`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now
  })))
  await db.insert(schema.organization).values({ id: team, name: 'Team', slug: `spc-${tag}`, createdAt: now })
  await db.insert(schema.customers).values({ id: customer, organizationId: team, name: 'Customer', createdAt: ms, updatedAt: ms })
  await db.insert(schema.customerMembers).values({ id: id('cm'), customerId: customer, userId: contact, createdAt: ms })
  await db.insert(schema.projects).values({ id: project, userId: staff, teamId: team, customerId: customer, name: `Launch ${tag}`, createdAt: ms, updatedAt: ms } as never)
  await db.insert(schema.projectColumns).values({ id: column, projectId: project, name: 'To do', position: 0, createdAt: ms })
  await db.insert(schema.projectTasks).values([
    { id: sharedTask, projectId: project, columnId: column, title: `Shared card ${tag}`, visibility: 'customer', position: 0, createdAt: ms, updatedAt: ms } as never,
    { id: teamTask, projectId: project, columnId: column, title: `Team card ${teamWord}`, visibility: 'internal', position: 1, createdAt: ms, updatedAt: ms } as never
  ])
  await db.insert(schema.taskComments).values([
    { id: sharedComment, taskId: sharedTask, userId: staff, body: 'shared hello', visibility: 'customer', createdAt: ms, updatedAt: ms } as never,
    { id: teamComment, taskId: sharedTask, userId: staff, body: `internal ${teamWord}`, visibility: 'internal', createdAt: ms, updatedAt: ms } as never
  ])
})

after(async () => {
  await db.delete(schema.taskComments).where(inArray(schema.taskComments.id, [sharedComment, teamComment]))
  await db.delete(schema.projectTasks).where(inArray(schema.projectTasks.id, [sharedTask, teamTask]))
  await db.delete(schema.projectColumns).where(eq(schema.projectColumns.id, column))
  await db.delete(schema.projects).where(eq(schema.projects.id, project))
  await db.delete(schema.customerMembers).where(eq(schema.customerMembers.customerId, customer))
  await db.delete(schema.customers).where(eq(schema.customers.id, customer))
  await db.delete(schema.organization).where(eq(schema.organization.id, team))
  await db.delete(schema.user).where(inArray(schema.user.id, [staff, contact]))
})

const contactRun = async () => sprocketRunContext({ userId: contact, teamId: team, customerId: customer })

test('a contact sees the shared card and its shared comment through get_task', async () => {
  const value = JSON.stringify(await runSprocketTool('get_task', { id: sharedTask }, await contactRun()))
  assert.match(value, /shared hello/)
  assert.ok(!value.includes(teamWord), 'the team-only comment is not in the answer')
})

test('a contact finds no team-only card by search', async () => {
  const found = JSON.stringify(await runSprocketTool('search_tasks', { query: teamWord }, await contactRun()))
  assert.ok(!found.includes(teamWord), 'the team-only card does not show up')
  assert.ok(!found.includes(teamTask))
})

test('a contact asking by id for a team-only card gets nothing', async () => {
  await assert.rejects(runSprocketTool('get_task', { id: teamTask }, await contactRun()))
})
