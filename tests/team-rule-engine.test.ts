// Team rules in the engine: one rule for every board of a team, with columns by name or none.
// Needs the dev database (DATABASE_URL) and the Nuxt aliases (`nuxt prepare`). Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/team-rule-engine.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

// Nitro provides createError as a global; the engine and its actions expect it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { member, organization, projectColumns, projectRules, projectTasks, projects, teamRuleRuns, teamRules, user } = schema
const { fireRules, newRuleChain } = await import('../server/utils/ruleEngine')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tre-${tag}-${name}`
const now = Date.now()

const owner = id('owner')
const admin = id('admin')
const team = id('team')
const withDone = id('board-done')
const withoutDone = id('board-plain')
const col = { todoA: id('todo-a'), doneA: id('done-a'), todoB: id('todo-b') }
const task = { a: id('task-a'), b: id('task-b') }

const base = { enabled: true, position: 0, createdAt: now, updatedAt: now, teamId: team }
const labelsOf = async (taskId: string) => (await db.select({ tags: projectTasks.tags }).from(projectTasks).where(eq(projectTasks.id, taskId)))[0]!.tags
const runsOf = (ruleId: string) => db.select().from(teamRuleRuns).where(eq(teamRuleRuns.ruleId, ruleId))
const moved = (projectId: string, taskId: string, columnId: string) => ({ type: 'task_moved' as const, projectId, taskId, actorId: owner, actorIsAgent: false, detail: columnId })
const added = (projectId: string, taskId: string) => ({ type: 'task_added' as const, projectId, taskId, actorId: owner, actorIsAgent: false })

before(async () => {
  const at = new Date()
  await db.insert(user).values([owner, admin].map(u => ({ id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })))
  await db.insert(organization).values({ id: team, name: 'Rules team', slug: team, createdAt: at })
  await db.insert(member).values([
    { id: id('m1'), organizationId: team, userId: owner, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: team, userId: admin, role: 'admin', createdAt: at }
  ])
  const board = (pid: string) => ({ id: pid, userId: owner, teamId: team, name: pid.slice(-10), createdAt: now, updatedAt: now })
  await db.insert(projects).values([board(withDone), board(withoutDone)])
  const column = (cid: string, pid: string, name: string, position: number) => ({ id: cid, projectId: pid, name, position, createdAt: now })
  await db.insert(projectColumns).values([
    column(col.todoA, withDone, 'To do', 0),
    column(col.doneA, withDone, 'DONE', 1000),
    column(col.todoB, withoutDone, 'To do', 0)
  ])
  const row = (tid: string, pid: string, cid: string) => ({ id: tid, projectId: pid, columnId: cid, title: tid.slice(-6), visibility: 'internal' as const, position: 0, createdAt: now, updatedAt: now })
  await db.insert(projectTasks).values([row(task.a, withDone, col.todoA), row(task.b, withoutDone, col.todoB)])
})

after(async () => {
  await db.delete(projects).where(inArray(projects.id, [withDone, withoutDone]))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, [owner, admin]))
  await db.$client.end()
})

test('a by-name team rule runs on the board that has the column, matching its name ignoring case', async () => {
  const ruleId = id('rule-by-name')
  await db.insert(teamRules).values({
    ...base, id: ruleId, name: 'Shipped label', mode: 'by_name', createdBy: owner,
    trigger: { kind: 'task_moved', columnName: 'done' }, conditions: [], actions: [{ kind: 'add_label', label: 'shipped' }]
  })
  await fireRules(moved(withDone, task.a, col.doneA), newRuleChain())
  assert.deepEqual(await labelsOf(task.a), ['shipped'])
  const runs = await runsOf(ruleId)
  assert.equal(runs.length, 1)
  assert.equal(runs[0]!.outcome, 'ran')
  assert.equal(runs[0]!.projectId, withDone)
})

test('the same rule does not run on a board that has no column of that name', async () => {
  const ruleId = id('rule-by-name')
  await fireRules(moved(withoutDone, task.b, col.todoB), newRuleChain())
  assert.deepEqual(await labelsOf(task.b), [])
  assert.equal((await runsOf(ruleId)).filter(run => run.projectId === withoutDone).length, 0)
})

test('a column-free team rule runs on every board of the team', async () => {
  const ruleId = id('rule-free')
  await db.insert(teamRules).values({
    ...base, id: ruleId, name: 'New label', mode: 'column_free', createdBy: admin,
    trigger: { kind: 'task_added' }, conditions: [], actions: [{ kind: 'add_label', label: 'fresh' }]
  })
  await fireRules(added(withDone, task.a), newRuleChain())
  await fireRules(added(withoutDone, task.b), newRuleChain())
  assert.ok((await labelsOf(task.a)).includes('fresh'))
  assert.deepEqual(await labelsOf(task.b), ['fresh'])
  assert.equal((await runsOf(ruleId)).length, 2)
})

test('a switched-off team rule does nothing', async () => {
  const ruleId = id('rule-off')
  await db.insert(teamRules).values({
    ...base, id: ruleId, name: 'Off', mode: 'column_free', enabled: false, createdBy: owner,
    trigger: { kind: 'task_added' }, conditions: [], actions: [{ kind: 'add_label', label: 'never' }]
  })
  await fireRules(added(withDone, task.a), newRuleChain())
  assert.ok(!(await labelsOf(task.a)).includes('never'))
  assert.equal((await runsOf(ruleId)).length, 0)
})

test('a rule written on the board still runs alongside the team rules', async () => {
  const boardRule = id('rule-board')
  await db.insert(projectRules).values({
    id: boardRule, projectId: withDone, name: 'Board label', enabled: true, position: 0, createdBy: owner, createdAt: now, updatedAt: now,
    trigger: { kind: 'task_added' }, conditions: [], actions: [{ kind: 'add_label', label: 'board' }]
  })
  await fireRules(added(withDone, task.a), newRuleChain())
  const labels = await labelsOf(task.a)
  assert.ok(labels.includes('board') && labels.includes('fresh'), labels.join(','))
})

test('a team rule that sets visibility needs an author who still owns the team', async () => {
  const byOwner = id('rule-vis-owner')
  const byAdmin = id('rule-vis-admin')
  const setVisible = { trigger: { kind: 'comment_added' }, conditions: [], actions: [{ kind: 'set_visibility', value: 'customer' }] }
  await db.insert(teamRules).values([
    { ...base, id: byOwner, name: 'Owner shares', mode: 'column_free', createdBy: owner, position: 10, ...setVisible },
    { ...base, id: byAdmin, name: 'Admin shares', mode: 'column_free', createdBy: admin, position: 20, ...setVisible }
  ])
  await fireRules({ type: 'comment_added', projectId: withDone, taskId: task.a, actorId: owner, actorIsAgent: false }, newRuleChain())
  const [ownerRun] = await runsOf(byOwner)
  const [adminRun] = await runsOf(byAdmin)
  assert.equal(ownerRun!.outcome, 'ran')
  assert.equal(adminRun!.outcome, 'failed')
  // The task stays as the owner's rule left it: the admin's rule was refused, not run.
  const [after] = await db.select({ visibility: projectTasks.visibility }).from(projectTasks).where(eq(projectTasks.id, task.a))
  assert.equal(after!.visibility, 'customer')
})
