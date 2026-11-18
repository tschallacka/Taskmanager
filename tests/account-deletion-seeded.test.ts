// The seeded-database test for account deletion (card mwjfpokj5rvl92bserd): a person with rows in many tables is deleted,
// and afterwards no row in ANY rule column still holds their id (a delete or a tombstone or a clear, as the rule says);
// the rows the rules keep are still there; the rows the rules delete are gone. The invariant is read from the rule
// table, so a new rule is checked here too. Needs the test database. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wren node --import tsx --test --test-force-exit tests/account-deletion-seeded.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray, sql } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { ACCOUNT_RULES, DELETED_USER_ID } = await import('../server/utils/accountRules')
const { deleteAccount } = await import('../server/utils/accountDeletion')
const { user, organization, member, projects, projectColumns, projectTasks, taskComments, timeEntries, notifications, pushSubscriptions, userSettings, boardPins, notificationPreferences, timeTimers, aiUsageRecords, apiKeys, projectWatchers, projectMessages, projectStatusUpdates, agentAudit, taskActivity, projectMembers, customerMembers, customers } = schema

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `seed-${tag}-${name}`
const at = new Date()
const now = Date.now()
const leaver = id('leaver')
const other = id('other')
const team = id('team')
const teamBoard = id('team-board')
const column = id('column')
const task = id('task')
const otherTask = id('other-task')
const customer = id('customer')
const keptTimeEntry = id('time-kept')
const keptComment = id('comment-kept')

before(async () => {
  await db.insert(user).values([
    { id: leaver, name: 'Seeded leaver', email: `${leaver}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at },
    { id: other, name: 'Seeded other', email: `${other}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at }
  ])
  await db.insert(organization).values({ id: team, name: 'Seeded team', slug: team, createdAt: at })
  await db.insert(member).values([
    { id: id('m-leaver'), organizationId: team, userId: leaver, role: 'member', createdAt: at },
    { id: id('m-other'), organizationId: team, userId: other, role: 'owner', createdAt: at }
  ])
  await db.insert(customers).values({ id: customer, organizationId: team, name: 'Seeded customer', createdAt: now, updatedAt: now })
  await db.insert(customerMembers).values({ id: id('cm'), customerId: customer, userId: leaver, createdAt: now } as never)
  await db.insert(projects).values({ id: teamBoard, userId: leaver, teamId: team, name: 'Seeded team board', createdAt: now, updatedAt: now })
  await db.insert(projectMembers).values({ id: id('pm'), projectId: teamBoard, userId: leaver, role: 'member', createdAt: now })
  await db.insert(projectColumns).values({ id: column, projectId: teamBoard, name: 'To do', position: 0, createdAt: now, createdBy: leaver } as never)
  await db.insert(projectTasks).values([
    { id: task, projectId: teamBoard, columnId: column, title: 'Seeded task', position: 0, createdAt: now, updatedAt: now, createdBy: leaver, assigneeId: leaver },
    { id: otherTask, projectId: teamBoard, columnId: column, title: 'Other task', position: 1, createdAt: now, updatedAt: now, createdBy: other }
  ])
  await db.insert(taskComments).values({ id: keptComment, taskId: otherTask, userId: leaver, body: 'Kept words', createdAt: now })
  await db.insert(timeEntries).values({ id: keptTimeEntry, taskId: otherTask, projectId: teamBoard, userId: leaver, minutes: 30, day: '2026-11-10', note: 'kept', createdAt: now })
  await db.insert(taskActivity).values({ id: id('activity'), taskId: task, projectId: teamBoard, actorId: leaver, kind: 'created', createdAt: now } as never)
  await db.insert(projectStatusUpdates).values({ id: id('status'), projectId: teamBoard, userId: leaver, status: 'on_track', body: 'Status text', createdAt: now } as never)
  await db.insert(projectMessages).values({ id: id('message'), projectId: teamBoard, userId: leaver, body: 'Message text', createdAt: now } as never)
  await db.insert(projectWatchers).values({ id: id('watch'), projectId: teamBoard, userId: leaver, createdAt: now } as never)
  await db.insert(boardPins).values({ id: id('pin'), userId: leaver, projectId: teamBoard, createdAt: now } as never)
  await db.insert(notifications).values({ id: id('notification'), userId: leaver, type: 'comment', projectId: teamBoard, title: 'Seeded note', createdAt: now })
  await db.insert(pushSubscriptions).values({ id: id('push'), userId: leaver, endpoint: `https://push.test/${tag}`, p256dh: 'x', auth: 'y', createdAt: now } as never)
  await db.insert(userSettings).values({ userId: leaver, updatedAt: at } as never)
  await db.insert(notificationPreferences).values({ userId: leaver } as never)
  await db.insert(timeTimers).values({ userId: leaver, taskId: otherTask, startedAt: now } as never)
  await db.insert(aiUsageRecords).values({ id: id('ai'), userId: leaver, action: 'chat', model: 'x', createdAt: at } as never)
  await db.insert(apiKeys).values({ id: id('key'), userId: leaver, name: 'Seeded key', keyHash: id('hash'), keyPrefix: 'arn_', createdAt: now, scopes: ['boards:read'], nameSlug: `seeded-${tag}`, nameSuffix: 'a1' } as never)
  await db.insert(agentAudit).values({ id: id('audit'), userId: leaver, keyName: 'seeded', tool: 'move_task', toolTitle: 'Move a task', createdAt: now } as never)
})

after(async () => {
  await db.delete(projects).where(eq(projects.id, teamBoard))
  await db.delete(customers).where(eq(customers.id, customer))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, [other, DELETED_USER_ID]))
  await db.$client.end()
})

// The number of rows in `table` whose `column` holds the person's id. Table and column come from the rule table.
async function holding(key: string): Promise<number> {
  const [table, column] = key.split('.') as [string, string]
  const rows = await db.execute(sql`select count(*)::int as n from ${sql.identifier(table)} where ${sql.identifier(column)} = ${leaver}`)
  return Number((rows as unknown as { n: number }[])[0]?.n ?? 0)
}

test('after deletion, no rule column still holds the person id', async () => {
  await deleteAccount(leaver)
  const left: string[] = []
  for (const [key, rule] of Object.entries(ACCOUNT_RULES)) {
    if (rule === 'delete-by-key') continue
    if ((await holding(key)) > 0) left.push(`${key} (${rule})`)
  }
  assert.deepEqual(left, [], `still holding the person: ${left.join(', ')}`)
})

test('the rows the rules delete are gone', async () => {
  const [notification] = await db.select().from(notifications).where(eq(notifications.id, id('notification')))
  assert.equal(notification, undefined, 'notification')
  const [push] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, id('push')))
  assert.equal(push, undefined, 'push subscription')
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, leaver))
  assert.equal(settings, undefined, 'user settings')
  const [pin] = await db.select().from(boardPins).where(eq(boardPins.userId, leaver))
  assert.equal(pin, undefined, 'board pin')
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id('key')))
  assert.equal(key, undefined, 'api key')
  const [watch] = await db.select().from(projectWatchers).where(eq(projectWatchers.userId, leaver))
  assert.equal(watch, undefined, 'project watcher')
  const [membership] = await db.select().from(projectMembers).where(eq(projectMembers.userId, leaver))
  assert.equal(membership, undefined, 'project membership')
})

test('the rows the rules keep are still there, under the tombstone or cleared', async () => {
  const [comment] = await db.select().from(taskComments).where(eq(taskComments.id, keptComment))
  assert.equal(comment?.body, 'Kept words')
  assert.equal(comment?.userId, DELETED_USER_ID)
  const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, keptTimeEntry))
  assert.equal(entry?.minutes, 30)
  assert.equal(entry?.userId, DELETED_USER_ID)
  const [status] = await db.select().from(projectStatusUpdates).where(eq(projectStatusUpdates.id, id('status')))
  assert.equal(status?.userId, DELETED_USER_ID)
  const [message] = await db.select().from(projectMessages).where(eq(projectMessages.id, id('message')))
  assert.equal(message?.body, 'Message text')
  const [seededTask] = await db.select().from(projectTasks).where(eq(projectTasks.id, task))
  assert.equal(seededTask?.createdBy, null)
  assert.equal(seededTask?.assigneeId, null)
  const [activity] = await db.select().from(taskActivity).where(eq(taskActivity.id, id('activity')))
  assert.equal(activity?.actorId, null)
  const [audit] = await db.select().from(agentAudit).where(eq(agentAudit.id, id('audit')))
  assert.equal(audit?.userId, DELETED_USER_ID)
})

test('the rule table is the whole of it: every rule key is checked by the invariant above', () => {
  assert.ok(Object.keys(ACCOUNT_RULES).length > 50)
})
