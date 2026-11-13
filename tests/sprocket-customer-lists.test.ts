// Sprocket's list tools for a customer contact: status updates, messages and logged time are staff-only on a board, so a
// contact's Sprocket is refused them and gets none of their content. The same tools answer a staff member's Sprocket with
// the content (a positive control, so the refusal is not just an empty table). Needs the test database. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wynn node --import tsx --test --test-force-exit tests/sprocket-customer-lists.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { sprocketRunContext, runSprocketTool } = await import('../server/utils/sprocketRun')
const { McpToolError } = await import('../server/utils/mcpToolKit')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `spl-${tag}-${name}`
const now = new Date()
const ms = Date.now()
const WORD = `staffonly${tag}`

const staff = id('staff')
const contact = id('contact')
const team = id('team')
const customer = id('customer')
const project = id('project')
const column = id('column')
const task = id('task')
const message = id('message')
const status = id('status')
const entry = id('entry')

before(async () => {
  await db.insert(schema.user).values([staff, contact].map((userId, i) => ({
    id: userId,
    name: i ? 'Contact' : 'Staff',
    email: `${userId}@example.test`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now
  })))
  await db.insert(schema.organization).values({ id: team, name: 'Team', slug: `spl-${tag}`, createdAt: now })
  await db.insert(schema.member).values({ id: id('member'), organizationId: team, userId: staff, role: 'owner', createdAt: now })
  await db.insert(schema.customers).values({ id: customer, organizationId: team, name: 'Customer', createdAt: ms, updatedAt: ms })
  await db.insert(schema.customerMembers).values({ id: id('cm'), customerId: customer, userId: contact, createdAt: ms })
  await db.insert(schema.projects).values({ id: project, userId: staff, teamId: team, customerId: customer, name: `Launch ${tag}`, createdAt: ms, updatedAt: ms } as never)
  await db.insert(schema.projectColumns).values({ id: column, projectId: project, name: 'To do', position: 0, createdAt: ms })
  await db.insert(schema.projectTasks).values({ id: task, projectId: project, columnId: column, title: `Card ${tag}`, visibility: 'customer', position: 0, createdAt: ms, updatedAt: ms } as never)
  await db.insert(schema.projectMessages).values({ id: message, projectId: project, userId: staff, title: 'Plan', body: `talk ${WORD}`, createdAt: ms })
  await db.insert(schema.projectStatusUpdates).values({ id: status, projectId: project, userId: staff, status: 'at_risk', body: `risk ${WORD}`, createdAt: ms })
  await db.insert(schema.timeEntries).values({ id: entry, taskId: task, projectId: project, userId: staff, minutes: 42, day: '2026-11-10', note: WORD, createdAt: ms })
})

after(async () => {
  await db.delete(schema.timeEntries).where(eq(schema.timeEntries.id, entry))
  await db.delete(schema.projectStatusUpdates).where(eq(schema.projectStatusUpdates.id, status))
  await db.delete(schema.projectMessages).where(eq(schema.projectMessages.id, message))
  await db.delete(schema.projectTasks).where(eq(schema.projectTasks.id, task))
  await db.delete(schema.projectColumns).where(eq(schema.projectColumns.id, column))
  await db.delete(schema.projects).where(eq(schema.projects.id, project))
  await db.delete(schema.customerMembers).where(eq(schema.customerMembers.customerId, customer))
  await db.delete(schema.customers).where(eq(schema.customers.id, customer))
  await db.delete(schema.member).where(eq(schema.member.organizationId, team))
  await db.delete(schema.organization).where(eq(schema.organization.id, team))
  await db.delete(schema.user).where(inArray(schema.user.id, [staff, contact]))
})

const lists = [
  { name: 'list_messages', args: () => ({ board: project }) },
  { name: 'list_status_updates', args: () => ({ board: project }) },
  { name: 'list_time', args: () => ({ task }) }
]

test('a staff member\'s Sprocket gets the messages, status updates and time (positive control)', async () => {
  const staffRun = await sprocketRunContext({ userId: staff, teamId: team })
  for (const list of lists) {
    const value = JSON.stringify(await runSprocketTool(list.name, list.args(), staffRun))
    assert.ok(value.includes(WORD) || value.includes('42'), `${list.name} shows the staff content`)
  }
})

test('a contact\'s Sprocket is refused every list and gets none of their content', async () => {
  const contactRun = await sprocketRunContext({ userId: contact, teamId: team, customerId: customer })
  for (const list of lists) {
    await assert.rejects(runSprocketTool(list.name, list.args(), contactRun), (error: unknown) => {
      assert.ok(error instanceof McpToolError, `${list.name} is refused with a tool message`)
      assert.ok(!error.message.includes(WORD), `${list.name} refusal carries no content`)
      return true
    }, `${list.name} is refused for a contact`)
  }
})
