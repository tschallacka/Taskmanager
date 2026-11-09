/* eslint-disable @typescript-eslint/no-explicit-any -- the backup is read loosely: each test checks the fields it names */
// The board import on a real database: the round trip of a whole board (timestamps to the millisecond,
// authors, subtasks, blockers, visibility), idempotency, a dry run that writes nothing, a rollback that leaves
// the board as it was, no side effects for a 50-card import (notifications, rule runs, GitHub), and the admin
// rule. Needs the database and the Nuxt aliases. Run against a scratch database only:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=<scratch url> node --import tsx --test tests/board-import.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq, inArray, count } from 'drizzle-orm'
import { readFileSync } from 'node:fs'

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const backupUtil = await import('../server/utils/boardBackup')
const imp = await import('../server/utils/boardImport')
const planner = await import('../server/utils/boardImportPlan')
const {
  user, organization, member, projects, projectColumns, projectTasks, projectFields, taskFieldValues, taskDependencies,
  taskActivity, taskComments, timeEntries, projectStatusUpdates, projectMessages, githubLinks, projectRules, boardImports,
  notifications, projectRuleRuns, agentAudit
} = schema

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `bi-${tag}-${name}`
const at = 1_700_000_000_123
const owner = id('owner')
const annUser = id('ann')
const bobUser = id('bob')
const carolUser = id('carol')
const team = id('team')
const source = id('src')
const target = id('dst')
const crewTarget = id('rules')
const cols = { todo: id('col-todo'), done: id('col-done') }
const tk = { parent: id('t-parent'), sub: id('t-sub'), done: id('t-done'), trashed: id('t-trashed') }

const created: { projects: string[], users: string[], teams: string[] } = { projects: [], users: [], teams: [] }

async function makeUser(userId: string, name: string) {
  await db.insert(user).values({ id: userId, name, email: `${userId}@arnotes.test`, emailVerified: true, createdAt: new Date(at), updatedAt: new Date(at) })
  created.users.push(userId)
}

async function makeBoard(projectId: string, name: string, columns: { id: string, name: string, position: number }[], teamId: string | null, userId: string) {
  await db.insert(projects).values({ id: projectId, userId, teamId, name, description: '', status: 'on_track', labelColors: {}, createdAt: at, updatedAt: at + 5 })
  await db.insert(projectColumns).values(columns.map(col => ({ ...col, projectId, createdAt: at })))
  created.projects.push(projectId)
}

/** The whole board as a backup document, the way the export route writes it. */
async function exportBoard(projectId: string, viewerId: string): Promise<any> {
  const [row] = await db.select().from(projects).where(eq(projects.id, projectId))
  // An admin's staff file, which is the one that holds names and addresses: the import maps people by them.
  const request = { project: row!, viewerId, callerId: viewerId, keyId: null, keyName: 'test', audience: 'staff' as const, admin: true, only: null, columns: null, inlineAttachments: false, instance: 'test.local' }
  const text = await new Response(backupUtil.streamBoardBackup(request)).text()
  return JSON.parse(text)
}

async function importInto(projectId: string, doc: any, importerId: string, authorMap: Record<string, string> = {}, dryRun = false) {
  const targetSnapshot = await imp.loadImportTarget(projectId, { userId: importerId, name: 'Importer', isOwner: true })
  const outcome = planner.planBoardImport(doc, { dryRun, columnMap: {}, onMissingColumn: 'create', authorMap, idempotencyKey: null, force: false }, targetSnapshot)
  if (!outcome.ok) assert.fail(`refused: ${outcome.message} ${outcome.problems.join(' | ')}`)
  if (!dryRun) await imp.writeImportPlan(outcome.plan, { importerId, keyId: null, keyName: 'test', createBoard: null })
  return outcome.plan
}

/** Row counts of the tables an import writes, for a board and across the instance. */
async function countsFor(projectId: string) {
  const one = async (table: any, where: any) => (await db.select({ n: count() }).from(table).where(where))[0]!.n
  return {
    tasks: await one(projectTasks, eq(projectTasks.projectId, projectId)),
    columns: await one(projectColumns, eq(projectColumns.projectId, projectId)),
    updates: await one(taskComments, inArray(taskComments.taskId, (await db.select({ id: projectTasks.id }).from(projectTasks).where(eq(projectTasks.projectId, projectId))).map(r => r.id).concat(['none']))),
    imports: await one(boardImports, eq(boardImports.projectId, projectId)),
    notifications: await one(notifications, eq(notifications.userId, annUser)),
    ruleRuns: await one(projectRuleRuns, eq(projectRuleRuns.projectId, crewTarget)),
    audit: await one(agentAudit, eq(agentAudit.userId, owner))
  }
}

before(async () => {
  await makeUser(owner, 'Olive Owner')
  await makeUser(annUser, 'Ann Member')
  await makeUser(bobUser, 'Bob Member')
  await makeUser(carolUser, 'Carol Outsider')
  await db.insert(organization).values({ id: team, name: 'Import team', slug: team, createdAt: new Date(at) })
  created.teams.push(team)
  await db.insert(member).values([
    { id: id('m-owner'), organizationId: team, userId: owner, role: 'owner', createdAt: new Date(at) },
    { id: id('m-ann'), organizationId: team, userId: annUser, role: 'member', createdAt: new Date(at) },
    { id: id('m-bob'), organizationId: team, userId: bobUser, role: 'member', createdAt: new Date(at) }
  ])

  // The source board: every section the import has to carry.
  await makeBoard(source, `Import source ${tag}`, [{ id: cols.todo, name: 'To do', position: 0 }, { id: cols.done, name: 'Done', position: 1000 }], team, owner)
  await db.insert(projectTasks).values([
    { id: tk.parent, projectId: source, columnId: cols.todo, title: `Parent ${tag}`, description: '<p>parent</p>', tags: ['crew'], visibility: 'customer', assigneeId: annUser, createdBy: owner, dueOn: '2026-12-01', position: 0, createdAt: at + 1, updatedAt: at + 2 },
    { id: tk.sub, projectId: source, columnId: cols.todo, parentTaskId: tk.parent, title: `Sub ${tag}`, description: '', tags: [], visibility: 'internal', position: 0, createdAt: at + 3, updatedAt: at + 4 },
    { id: tk.done, projectId: source, columnId: cols.done, title: `Finished ${tag}`, description: '', tags: [], visibility: 'internal', completedAt: at + 9, position: 1000, createdAt: at + 6, updatedAt: at + 9 },
    { id: tk.trashed, projectId: source, columnId: cols.done, title: `Trashed ${tag}`, description: '', tags: [], visibility: 'internal', position: 2000, createdAt: at + 7, updatedAt: at + 8, deletedAt: at + 8, deletedBy: owner, deletedVia: 'mcp' }
  ])
  await db.insert(taskDependencies).values({ id: id('dep'), blockedTaskId: tk.sub, blockerTaskId: tk.parent, createdBy: owner, createdAt: at + 3 })
  await db.insert(taskComments).values([
    { id: id('u1'), taskId: tk.parent, userId: bobUser, body: 'bob internal', visibility: 'internal', createdVia: 'ui', createdAt: at + 10, editedAt: at + 11 },
    { id: id('u2'), taskId: tk.parent, userId: annUser, body: 'ann customer', visibility: 'customer', createdVia: 'mcp', replyToId: id('u1'), createdAt: at + 12 },
    { id: id('u3'), taskId: tk.parent, userId: carolUser, body: 'carol was here', visibility: 'internal', createdVia: 'ui', createdAt: at + 14 }
  ])
  await db.insert(taskActivity).values({ id: id('act'), taskId: tk.parent, projectId: source, actorId: owner, via: 'ui', kind: 'created', detail: { title: 'Parent' }, createdAt: at + 1 })
  await db.insert(timeEntries).values({ id: id('time'), taskId: tk.parent, projectId: source, userId: annUser, minutes: 90, day: '2026-11-08', note: 'work', createdAt: at + 13 })
  await db.insert(projectFields).values({ id: id('field'), projectId: source, name: 'Priority', type: 'select', options: [{ id: 'o1', label: 'High', color: 'red' }], position: 0, createdAt: at })
  await db.insert(taskFieldValues).values({ taskId: tk.parent, fieldId: id('field'), value: 'o1' })
  await db.insert(githubLinks).values({ id: id('gh'), projectId: source, taskId: tk.parent, kind: 'pull', owner: 'acme', repo: 'app', ref: '12', url: 'https://github.com/acme/app/pull/12', visibility: 'internal', createdBy: owner, createdAt: at + 15 })
  await db.insert(projectStatusUpdates).values({ id: id('status'), projectId: source, userId: owner, status: 'at_risk', body: 'late', createdAt: at + 16 })
  await db.insert(projectMessages).values([
    { id: id('msg'), projectId: source, userId: owner, title: 'Hello', body: 'first', createdAt: at + 17 },
    { id: id('reply'), projectId: source, userId: annUser, parentId: id('msg'), title: '', body: 'reply', createdAt: at + 18 }
  ])
  await db.insert(projectRules).values({ id: id('rule'), projectId: source, name: 'Ship it', enabled: true, trigger: { kind: 'task_moved', columnId: cols.done }, conditions: [], actions: [{ kind: 'complete' }], position: 0, createdBy: owner, createdAt: at, updatedAt: at })
})

after(async () => {
  for (const projectId of created.projects) await db.delete(projects).where(eq(projects.id, projectId)).catch(() => {})
  for (const teamId of created.teams) await db.delete(organization).where(eq(organization.id, teamId)).catch(() => {})
  for (const userId of created.users) await db.delete(user).where(eq(user.id, userId)).catch(() => {})
})

test('round trip: the board comes back with its dates to the millisecond, its authors and its links', async () => {
  const doc = await exportBoard(source, owner)
  await makeBoard(target, `Import target ${tag}`, [{ id: id('dst-todo'), name: 'To do', position: 0 }, { id: id('dst-done'), name: 'Done', position: 1000 }], team, owner)
  const keyOf = (name: string) => doc.people.find((p: any) => p.name === name).key
  // Ann's address is private, so she is mapped by the authorMap, not by email.
  const plan = await importInto(target, doc, owner, { [keyOf('Bob Member')]: bobUser, [keyOf('Ann Member')]: annUser })
  assert.equal(plan.report.created.tasks, 4)

  const rows = await db.select().from(projectTasks).where(eq(projectTasks.projectId, target))
  const byTitle = (title: string) => rows.find(row => row.title === title)!
  const parent = byTitle(`Parent ${tag}`)
  assert.equal(parent.createdAt, at + 1)
  assert.equal(parent.updatedAt, at + 2)
  assert.equal(parent.visibility, 'customer')
  assert.equal(parent.dueOn, '2026-12-01')
  assert.equal(byTitle(`Finished ${tag}`).completedAt, at + 9)
  const trashed = byTitle(`Trashed ${tag}`)
  assert.equal(trashed.deletedAt, at + 8)
  assert.equal(trashed.deletedVia, 'mcp')
  const sub = byTitle(`Sub ${tag}`)
  assert.equal(sub.parentTaskId, parent.id, 'the subtask follows its parent')
  assert.equal(sub.visibility, 'internal')

  const blockers = await db.select().from(taskDependencies).where(eq(taskDependencies.blockedTaskId, sub.id))
  assert.deepEqual(blockers.map(row => row.blockerTaskId), [parent.id])

  const updates = await db.select().from(taskComments).where(eq(taskComments.taskId, parent.id))
  const bob = updates.find(row => row.body === 'bob internal')!
  assert.equal(bob.userId, bobUser, 'Bob is mapped by authorMap')
  assert.equal(bob.authorLabel, null)
  assert.equal(bob.editedAt, at + 11)
  assert.equal(bob.createdAt, at + 10)
  const ann = updates.find(row => row.body === 'ann customer')!
  assert.equal(ann.visibility, 'customer')
  assert.equal(ann.replyToId, bob.id, 'the reply points at the new update')
  const carol = updates.find(row => row.body === 'carol was here')!
  assert.equal(carol.userId, owner, 'an author outside the team becomes the importer')
  assert.equal(carol.authorLabel, 'Carol Outsider', 'and keeps the name as data')

  const activity = await db.select().from(taskActivity).where(eq(taskActivity.taskId, parent.id))
  assert.equal(activity[0]!.createdAt, at + 1)
  const time = await db.select().from(timeEntries).where(eq(timeEntries.taskId, parent.id))
  assert.equal(time[0]!.createdAt, at + 13)
  assert.equal(time[0]!.userId, annUser, 'Ann is matched by the authorMap')
  const fieldValues = await db.select().from(taskFieldValues).where(eq(taskFieldValues.taskId, parent.id))
  assert.equal(fieldValues.length, 1)
  const links = await db.select().from(githubLinks).where(eq(githubLinks.taskId, parent.id))
  assert.equal(links[0]!.createdAt, at + 15)
  assert.equal(links[0]!.visibility, 'internal')

  const messages = await db.select().from(projectMessages).where(eq(projectMessages.projectId, target))
  const reply = messages.find(row => row.body === 'reply')!
  assert.equal(reply.parentId, messages.find(row => row.body === 'first')!.id)
  const status = await db.select().from(projectStatusUpdates).where(eq(projectStatusUpdates.projectId, target))
  assert.equal(status[0]!.createdAt, at + 16)
})

test('idempotency: a second import of the same backup creates nothing', async () => {
  const doc = await exportBoard(source, owner)
  const before = await countsFor(target)
  const plan = await importInto(target, doc, owner)
  assert.equal(plan.report.created.tasks, 0)
  assert.equal(plan.report.created.updates, 0)
  assert.equal(plan.report.created.activity, 0)
  assert.equal(plan.report.created.messages, 0)
  assert.equal(plan.report.skippedCount, 4 + 2 + 1 + 1, 'every card, message, status update and rule is skipped')
  const after = await countsFor(target)
  // The second import writes one audit row, which records the attempt and its skipped count; no board rows change.
  assert.deepEqual({ ...after, audit: 0 }, { ...before, audit: 0 })
  assert.equal(after.audit, before.audit + 1)
})

test('a dry run writes nothing', async () => {
  const dry = id('dry')
  await makeBoard(dry, `Dry run ${tag}`, [{ id: id('dry-todo'), name: 'To do', position: 0 }], team, owner)
  const doc = await exportBoard(source, owner)
  const before = await countsFor(dry)
  // The export itself writes an audit row; it is counted above, so the counts below compare the import alone.
  const plan = await importInto(dry, doc, owner, {}, true)
  assert.equal(plan.report.dryRun, true)
  assert.equal(plan.report.created.tasks, 4)
  assert.deepEqual(await countsFor(dry), before)
})

test('rollback: a failing write leaves the board as it was', async () => {
  const boardId = id('rollback')
  await makeBoard(boardId, `Rollback ${tag}`, [{ id: id('rb-todo'), name: 'To do', position: 0 }, { id: id('rb-done'), name: 'Done', position: 1000 }], team, owner)
  const doc = await exportBoard(source, owner)
  const targetSnapshot = await imp.loadImportTarget(boardId, { userId: owner, name: 'Owner', isOwner: true })
  const outcome = planner.planBoardImport(doc, { dryRun: false, columnMap: {}, onMissingColumn: 'create', authorMap: {}, idempotencyKey: null, force: false }, targetSnapshot)
  assert.equal(outcome.ok, true)
  if (!outcome.ok) return
  // A value that names a field which does not exist: the database refuses it after the cards are written.
  outcome.plan.fieldValues.push({ taskId: outcome.plan.tasks[0]!.id, fieldId: 'no-such-field', value: 'x' })
  const before = await countsFor(boardId)
  await assert.rejects(imp.writeImportPlan(outcome.plan, { importerId: owner, keyId: null, keyName: 'test', createBoard: null }))
  assert.deepEqual(await countsFor(boardId), before)
})

test('no side effects: a 50-card import sends no notification, fires no rule and syncs nothing', async () => {
  // A board with an enabled rule that would act on every new card, and a card assigned to Ann (who gets notified of assignments).
  await makeBoard(crewTarget, `Rules ${tag}`, [{ id: id('rules-todo'), name: 'To do', position: 0 }], team, owner)
  await db.insert(projectRules).values({ id: id('live-rule'), projectId: crewTarget, name: 'Label new cards', enabled: true, trigger: { kind: 'task_added' }, conditions: [], actions: [{ kind: 'add_label', label: 'fired' }], position: 0, createdBy: owner, createdAt: at, updatedAt: at })
  const bulk = id('bulk')
  await makeBoard(bulk, `Bulk ${tag}`, [{ id: id('bulk-todo'), name: 'To do', position: 0 }], team, owner)
  const rows = Array.from({ length: 50 }, (_, i) => ({
    id: id(`bulk-${i}`), projectId: bulk, columnId: id('bulk-todo'), title: `Bulk card ${i} ${tag}`, description: '', tags: [],
    visibility: 'internal' as const, assigneeId: annUser, createdBy: owner, position: i * 1000, createdAt: at + i, updatedAt: at + i
  }))
  await db.insert(projectTasks).values(rows)
  const doc = await exportBoard(bulk, owner)
  const before = await countsFor(crewTarget)
  const targetCount = await db.select({ n: count() }).from(githubLinks).where(eq(githubLinks.projectId, crewTarget))
  const plan = await importInto(crewTarget, doc, owner)
  assert.equal(plan.report.created.tasks, 50)
  const after = await countsFor(crewTarget)
  assert.equal(after.tasks - before.tasks, 50)
  assert.equal(after.notifications, before.notifications, 'no notification was sent')
  assert.equal(after.ruleRuns, before.ruleRuns, 'no rule ran')
  const labelled = await db.select({ tags: projectTasks.tags }).from(projectTasks).where(eq(projectTasks.projectId, crewTarget))
  assert.ok(labelled.every(row => !row.tags.includes('fired')), 'the enabled rule did not label the imported cards')
  const links = await db.select({ n: count() }).from(githubLinks).where(eq(githubLinks.projectId, crewTarget))
  assert.equal(links[0]!.n, targetCount[0]!.n, 'nothing was synced to GitHub')
  const imported = await db.select().from(projectRules).where(eq(projectRules.projectId, crewTarget))
  assert.ok(imported.filter(row => row.name !== 'Label new cards').every(row => row.enabled === false) || imported.length === 1)
  // The import wrote the card rows and their timestamps as they were.
  const first = labelled.length
  assert.equal(first, 50)
  const sample = await db.select().from(projectTasks).where(eq(projectTasks.projectId, crewTarget))
  const card = sample.find(row => row.title === `Bulk card 7 ${tag}`)!
  assert.equal(card.createdAt, at + 7)
  assert.equal(card.updatedAt, at + 7)
})

test('the admin rule: the instance admin, or an owner or admin of the team; a crew only on its own board', () => {
  const base = { isInstanceAdmin: false, teamRole: null as string | null, personalOwner: false, isCrew: false, crewOwnsBoard: false }
  assert.equal(imp.importRefusal({ ...base, teamRole: 'owner' }), null)
  assert.equal(imp.importRefusal({ ...base, teamRole: 'admin' }), null)
  assert.notEqual(imp.importRefusal({ ...base, teamRole: 'member' }), null, 'a plain member is refused')
  assert.notEqual(imp.importRefusal({ ...base }), null, 'a caller with no team role is refused')
  assert.equal(imp.importRefusal({ ...base, isInstanceAdmin: true }), null)
  assert.equal(imp.importRefusal({ ...base, personalOwner: true }), null, 'the owner of a personal board')
  assert.notEqual(imp.importRefusal({ ...base, teamRole: 'owner', isCrew: true }), null, 'a crew is refused even as an owner')
  assert.notEqual(imp.importRefusal({ ...base, isInstanceAdmin: true, isCrew: true }), null, 'a crew is refused even for the instance admin')
  assert.equal(imp.importRefusal({ ...base, isCrew: true, crewOwnsBoard: true }), null, 'a crew imports into its own board')
})

test('a crew\'s own boards: its shadow board and the board it was made on, in its own team; never a real board', async () => {
  const access = await import('../server/utils/crewBoardAccess')
  const crewTeam = id('crew-team')
  const crewId = id('own-crew')
  const workBoard = id('crew-work')
  const shadow = id('crew-shadow')
  const real = id('crew-real')
  const otherCrew = id('other-crew')
  await db.insert(organization).values({ id: crewTeam, name: `Crew team ${tag}`, slug: id('crew-team-slug'), createdAt: new Date(at) })
  created.teams.push(crewTeam)
  await makeBoard(workBoard, `Work ${tag}`, [{ id: id('work-todo'), name: 'To do', position: 0 }], crewTeam, owner)
  await makeBoard(shadow, `Shadow ${tag}`, [{ id: id('shadow-todo'), name: 'To do', position: 0 }], crewTeam, owner)
  await makeBoard(real, `Real ${tag}`, [{ id: id('real-todo'), name: 'To do', position: 0 }], team, owner)
  await db.insert(schema.crews).values([
    { id: crewId, slug: id('own-crew-slug'), name: 'Own crew', teamId: crewTeam, boardId: workBoard, createdAt: at },
    { id: otherCrew, slug: id('other-crew-slug'), name: 'Other crew', teamId: crewTeam, createdAt: at }
  ])
  await db.insert(schema.crewBoards).values({ id: id('crew-link'), crewId, projectId: real, shadowProjectId: shadow, createdAt: at })
  try {
    assert.equal(await access.isOwnCrewBoard(crewId, shadow), true, 'its shadow board')
    assert.equal(await access.isOwnCrewBoard(crewId, workBoard), true, 'the board it was made on')
    assert.equal(await access.isOwnCrewBoard(crewId, real), false, 'never the real board it works on')
    assert.equal(await access.isOwnCrewBoard(otherCrew, shadow), false, 'not another crew\'s shadow board')
    assert.equal(await access.isOwnCrewBoard(id('no-crew'), shadow), false, 'not for an unknown crew')
  } finally {
    await db.delete(schema.crewBoards).where(eq(schema.crewBoards.crewId, crewId))
    await db.delete(schema.crews).where(inArray(schema.crews.id, [crewId, otherCrew]))
  }
})

test('the import source code calls no notification, agent-event, rule, GitHub or activity module', async () => {
  const forbidden = ['notifyEvents', 'agentEvents', 'ruleEngine', 'ruleActions', 'githubSync', 'githubCards', 'taskActivity', 'notifications', 'dueRules', 'crewRules']
  for (const file of ['server/utils/boardImport.ts', 'server/utils/boardImportPlan.ts', 'server/utils/boardImportRequest.ts']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    const imports = [...source.matchAll(/from '([^']+)'/g)].map(match => match[1]!)
    for (const name of forbidden) {
      assert.ok(!imports.some(path => path.includes(name)), `${file} imports ${name}`)
    }
  }
})
