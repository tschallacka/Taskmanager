// The built-in crew rules: promotion, gate routing, the time-log check and the failing-test clock.
// Needs the scratch database (DATABASE_URL) and the Nuxt aliases (`nuxt prepare`). Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5432/arnotes_test node --import tsx --test tests/crew-server-rules.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

// Nitro provides createError as a global; the engine and its actions expect it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { crewBoardMembers, crewBoards, crews, member, organization, projectColumns, projectTasks, projects, taskActivity, taskComments, taskDependencies, timeEntries, user } = schema
const { fireRules, newRuleChain } = await import('../server/utils/ruleEngine')
const { sweepTestClock, gatesRequired, firstOpenGate, hasViolation, testClockStage, tagAddEntries, isCrewColumnSet, GATES } = await import('../server/utils/crewRules')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `csr-${tag}-${name}`
const now = Date.now()
const MIN = 60_000

const people = { owner: id('owner'), pia: id('pia'), pat: id('pat'), usher: id('usher'), nina: id('nina'), quincy: id('quincy'), boss: id('boss'), worker: id('worker'), outsider: id('outsider') }
const team = id('team')
const crew = id('crew-board')
const shadow = id('shadow')
const plain = id('plain-board')
const crewRow = id('crew')
const link = id('link')
const cols = Object.fromEntries(['backlog', 'todo', 'inprogress', 'pm', 'ux', 'cq', 'qa', 'verify', 'blocked', 'done'].map(name => [name, id(`col-${name}`)]))
const plainCols = { todo: id('plain-todo'), done: id('plain-done') }

// Tasks on the crew board.
const t = Object.fromEntries(['blocker', 'dependent', 'orphan', 'other', 'gated', 'timed', 'timedWork', 'violating', 'test', 'plainTask'].map(name => [name, id(`task-${name}`)]))
const sub = { cq: id('sub-cq'), ux: id('sub-ux') }

const pmCol = cols.pm!
const members = [people.owner, people.pia, people.pat, people.usher, people.nina, people.quincy, people.boss, people.worker, people.outsider]

const labelsOf = async (taskId: string) => (await db.select({ tags: projectTasks.tags }).from(projectTasks).where(eq(projectTasks.id, taskId)))[0]!.tags
const columnOf = async (taskId: string) => {
  const [row] = await db.select({ columnId: projectTasks.columnId, assigneeId: projectTasks.assigneeId }).from(projectTasks).where(eq(projectTasks.id, taskId))
  return row!
}
const setColumn = (taskId: string, columnId: string) => db.update(projectTasks).set({ columnId }).where(eq(projectTasks.id, taskId))
const comments = (taskId: string) => db.select().from(taskComments).where(eq(taskComments.taskId, taskId))
// Records a tag add the way the task route now does, as the given person. Each line gets its own
// timestamp, so the latest one is the one the setter lookup reads.
let tagClock = now
const setTag = (taskId: string, label: string, actorId: string) => db.insert(taskActivity).values({
  id: id(`act-${label}-${Math.random().toString(36).slice(2)}`), taskId, projectId: crew, actorId, via: 'ui', kind: 'label', detail: { to: label }, createdAt: ++tagClock
})
const moved = (taskId: string, columnId: string, actorId: string | null = people.owner) => ({ type: 'task_moved' as const, projectId: crew, taskId, actorId, actorIsAgent: false, detail: columnId })

before(async () => {
  const stamp = new Date()
  await db.insert(user).values(members.map(u => ({ id: u, name: u.replace(/^csr-.*-/, ''), email: `${u}@arnotes.test`, emailVerified: true, createdAt: stamp, updatedAt: stamp })))
  await db.insert(organization).values({ id: team, name: 'Crew rules team', slug: team, createdAt: stamp })
  await db.insert(member).values(members.map(u => ({ id: id(`m-${u}`), organizationId: team, userId: u, role: u === people.owner ? 'owner' : 'member', createdAt: stamp })))
  const board = (pid: string, name: string) => ({ id: pid, userId: people.owner, teamId: team, name, createdAt: now, updatedAt: now })
  await db.insert(projects).values([board(crew, 'crew board'), board(shadow, 'shadow'), board(plain, 'plain board')])
  const column = (cid: string, pid: string, name: string, position: number) => ({ id: cid, projectId: pid, name, position, createdAt: now })
  await db.insert(projectColumns).values([
    column(cols.backlog!, crew, 'Backlog', 0), column(cols.todo!, crew, 'To do', 1000), column(cols.inprogress!, crew, 'In progress', 2000),
    column(cols.pm!, crew, 'Verify PM', 3000), column(cols.ux!, crew, 'Verify UX', 4000), column(cols.cq!, crew, 'Verify CQ', 5000),
    column(cols.qa!, crew, 'Verify QA', 6000), column(cols.verify!, crew, 'Verify', 7000), column(cols.blocked!, crew, 'Blocked', 8000),
    column(cols.done!, crew, 'Done', 9000),
    column(plainCols.todo, plain, 'To do', 0), column(plainCols.done, plain, 'Done', 1000)
  ])
  await db.insert(crews).values({ id: crewRow, slug: crewRow, name: 'Crew', teamId: team, boardId: crew, createdBy: people.owner, createdAt: now })
  await db.insert(crewBoards).values({ id: link, crewId: crewRow, projectId: crew, shadowProjectId: shadow, createdBy: people.owner, createdAt: now })
  const roles: [string, string][] = [[people.pia, 'pia'], [people.pat, 'pat'], [people.usher, 'usher'], [people.nina, 'nina'], [people.quincy, 'quincy'], [people.boss, 'boss'], [people.worker, 'worker']]
  await db.insert(crewBoardMembers).values(roles.map(([userId, personKey]) => ({ id: id(`cbm-${personKey}`), linkId: link, userId, personKey, agentType: 'x', createdAt: now })))
  const task = (taskId: string, columnId: string, extra: Partial<typeof projectTasks.$inferInsert> = {}) => ({
    id: taskId, projectId: crew, columnId, title: taskId.slice(-8), visibility: 'internal' as const, position: 0, createdAt: now, updatedAt: now, ...extra
  })
  await db.insert(projectTasks).values([
    task(t.blocker!, cols.inprogress!, { assigneeId: people.worker }),
    task(t.dependent!, cols.backlog!, { assigneeId: people.worker }),
    task(t.orphan!, cols.backlog!, { assigneeId: null }),
    task(t.other!, cols.inprogress!, { assigneeId: people.worker }),
    task(t.gated!, pmCol, { assigneeId: people.worker, tags: ['pm approved'] }),
    task(t.timed!, pmCol, { assigneeId: people.worker, tags: [] }),
    task(t.timedWork!, pmCol, { assigneeId: people.worker, tags: [] }),
    task(t.violating!, pmCol, { assigneeId: people.worker, tags: ['pm approved'] }),
    task(t.test!, cols.blocked!, { assigneeId: people.worker, tags: ['test failing'] }),
    { ...task(t.plainTask!, plainCols.todo), projectId: plain, title: 'plain' }
  ])
  // The gated card has time logged, so the time-log check leaves it in Verify PM for the gates to route.
  await db.insert(timeEntries).values({ id: id('time-gated'), taskId: t.gated!, projectId: crew, userId: people.worker, minutes: 30, day: '2026-11-07', note: '', createdAt: now })
  await db.insert(projectTasks).values([
    { ...task(sub.cq, pmCol, { parentTaskId: t.violating! }), tags: ['cq violation'] },
    { ...task(sub.ux, pmCol, { parentTaskId: t.gated! }), tags: ['verify ux'] }
  ])
})

after(async () => {
  await db.delete(projects).where(inArray(projects.id, [crew, shadow, plain]))
  await db.delete(crews).where(eq(crews.id, crewRow))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, members))
  await db.$client.end()
})

test('promotion: a Backlog card whose last blocker finishes goes to To do and keeps its assignee', async () => {
  await db.update(projectTasks).set({ completedAt: now }).where(eq(projectTasks.id, t.blocker!))
  await db.insert(taskDependencies).values({ id: id('dep-1'), blockedTaskId: t.dependent!, blockerTaskId: t.blocker!, createdAt: now })
  await fireRules({ type: 'task_completed', projectId: crew, taskId: t.blocker!, actorId: people.owner, actorIsAgent: false, detail: null }, newRuleChain())
  assert.equal((await columnOf(t.dependent!)).columnId, cols.todo)
  assert.equal((await columnOf(t.dependent!)).assigneeId, people.worker)
  // A second firing of the same finish does nothing more: the card is already in To do.
  await fireRules({ type: 'task_completed', projectId: crew, taskId: t.blocker!, actorId: people.owner, actorIsAgent: false, detail: null }, newRuleChain())
  assert.equal((await comments(t.dependent!)).length, 0)
})

test('promotion: a card with no assignee is tagged needs assignee and Pia is told', async () => {
  await db.insert(taskDependencies).values({ id: id('dep-2'), blockedTaskId: t.orphan!, blockerTaskId: t.blocker!, createdAt: now })
  await fireRules({ type: 'task_completed', projectId: crew, taskId: t.blocker!, actorId: people.owner, actorIsAgent: false, detail: null }, newRuleChain())
  assert.equal((await columnOf(t.orphan!)).columnId, cols.todo)
  assert.ok((await labelsOf(t.orphan!)).includes('needs assignee'))
  const notes = await comments(t.orphan!)
  assert.equal(notes.length, 1)
  assert.match(notes[0]!.body, /^Rule "Crew: promotion": @pia/)
})

test('promotion: a card that still waits for another open blocker stays in Backlog (negative)', async () => {
  const stillOpen = id('task-still-open')
  await db.insert(projectTasks).values({ id: stillOpen, projectId: crew, columnId: cols.inprogress!, title: 'open', visibility: 'internal', position: 9, createdAt: now, updatedAt: now })
  await db.insert(taskDependencies).values([
    { id: id('dep-3a'), blockedTaskId: t.other!, blockerTaskId: t.blocker!, createdAt: now },
    { id: id('dep-3b'), blockedTaskId: t.other!, blockerTaskId: stillOpen, createdAt: now }
  ])
  await db.update(projectTasks).set({ columnId: cols.backlog! }).where(eq(projectTasks.id, t.other!))
  await fireRules({ type: 'task_completed', projectId: crew, taskId: t.blocker!, actorId: people.owner, actorIsAgent: false, detail: null }, newRuleChain())
  assert.equal((await columnOf(t.other!)).columnId, cols.backlog)
})

test('time-log check: a card entering Verify PM with no time logged goes back to To do, once', async () => {
  await setColumn(t.timed!, pmCol)
  await fireRules(moved(t.timed!, pmCol), newRuleChain())
  assert.equal((await columnOf(t.timed!)).columnId, cols.todo)
  const notes = (await comments(t.timed!)).filter(c => c.body.startsWith('Rule "Crew: time-log check"'))
  assert.equal(notes.length, 1)
  // Entering Verify PM again with still no time: the standard update is already on the card, so nothing more happens.
  await setColumn(t.timed!, pmCol)
  await fireRules(moved(t.timed!, pmCol), newRuleChain())
  assert.equal((await comments(t.timed!)).filter(c => c.body.startsWith('Rule "Crew: time-log check"')).length, 1)
})

test('time-log check: a card with logged time stays in Verify PM (negative)', async () => {
  await db.insert(timeEntries).values({ id: id('time-1'), taskId: t.timedWork!, projectId: crew, userId: people.worker, minutes: 30, day: '2026-11-07', note: '', createdAt: now })
  await setColumn(t.timedWork!, pmCol)
  await fireRules(moved(t.timedWork!, pmCol), newRuleChain())
  assert.equal((await columnOf(t.timedWork!)).columnId, pmCol)
})

test('gate routing: a card Pia approved goes to Verify CQ for Nina, skipping no required gate', async () => {
  // A subtask carries verify ux, so UX comes first; CQ and QA are always required.
  await setTag(t.gated!, 'pm approved', people.pia)
  await fireRules({ type: 'tags_changed', projectId: crew, taskId: t.gated!, actorId: people.pia, actorIsAgent: false, detail: null }, newRuleChain())
  assert.deepEqual(await columnOf(t.gated!), { columnId: cols.ux, assigneeId: people.usher })
})

test('gate routing: a gate approval by anyone but the reviewer does not count (negative)', async () => {
  // The card is back in Verify PM with an approval from the owner, not from Usher.
  await setColumn(t.gated!, pmCol)
  await setTag(t.gated!, 'ux approved', people.owner)
  await fireRules(moved(t.gated!, pmCol, people.pia), newRuleChain())
  assert.deepEqual(await columnOf(t.gated!), { columnId: cols.ux, assigneeId: people.usher })
})

test('gate routing: the reviewer approves each gate in turn, then the card goes to Verify for Boss', async () => {
  // A reviewer's approval is a tag on the card and a line in the log naming the reviewer, as the route writes it.
  const approve = async (label: string, actor: string) => {
    await setTag(t.gated!, label, actor)
    await db.update(projectTasks).set({ tags: [...(await labelsOf(t.gated!)), label] }).where(eq(projectTasks.id, t.gated!))
  }
  await approve('ux approved', people.usher)
  await setColumn(t.gated!, pmCol)
  await fireRules(moved(t.gated!, pmCol, people.pia), newRuleChain())
  assert.deepEqual(await columnOf(t.gated!), { columnId: cols.cq, assigneeId: people.nina })
  await approve('cq approved', people.nina)
  await setColumn(t.gated!, pmCol)
  await fireRules(moved(t.gated!, pmCol, people.pia), newRuleChain())
  assert.deepEqual(await columnOf(t.gated!), { columnId: cols.qa, assigneeId: people.quincy })
  await approve('qa approved', people.quincy)
  await setColumn(t.gated!, pmCol)
  await fireRules(moved(t.gated!, pmCol, people.pia), newRuleChain())
  assert.deepEqual(await columnOf(t.gated!), { columnId: cols.verify, assigneeId: people.boss })
})

test('gate routing: a violation on a subtask returns the card to To do for its worker', async () => {
  await db.update(projectTasks).set({ tags: ['cq violation'] }).where(eq(projectTasks.id, sub.cq))
  await setTag(t.violating!, 'pm approved', people.pia)
  await fireRules({ type: 'tags_changed', projectId: crew, taskId: t.violating!, actorId: people.pia, actorIsAgent: false, detail: null }, newRuleChain())
  assert.deepEqual(await columnOf(t.violating!), { columnId: cols.todo, assigneeId: people.worker })
})

test('gate routing: a card Pia did not approve stays where it is (negative)', async () => {
  const unapproved = id('task-unapproved')
  await db.insert(projectTasks).values({ id: unapproved, projectId: crew, columnId: pmCol, title: 'u', visibility: 'internal', position: 10, tags: ['pm approved'], assigneeId: people.worker, createdAt: now, updatedAt: now })
  await setTag(unapproved, 'pm approved', people.worker)
  await fireRules({ type: 'tags_changed', projectId: crew, taskId: unapproved, actorId: people.worker, actorIsAgent: false, detail: null }, newRuleChain())
  assert.equal((await columnOf(unapproved)).columnId, pmCol)
})

test('a board that is not a crew board gets none of the crew rules (negative)', async () => {
  await db.update(projectTasks).set({ tags: ['pm approved'] }).where(eq(projectTasks.id, t.plainTask!))
  await fireRules({ type: 'task_moved', projectId: plain, taskId: t.plainTask!, actorId: people.owner, actorIsAgent: false, detail: plainCols.done }, newRuleChain())
  assert.equal((await columnOf(t.plainTask!)).columnId, plainCols.todo)
})

test('the crew rules switch: off leaves a card alone, on moves the same card (negative and control)', async () => {
  const card = id('task-switch')
  const fresh = () => db.insert(projectTasks).values({ id: card, projectId: crew, columnId: pmCol, title: 'switch', visibility: 'internal', position: 12, assigneeId: people.worker, createdAt: now, updatedAt: now })
  await db.update(projects).set({ crewRulesOn: false }).where(eq(projects.id, crew))
  try {
    await fresh()
    await fireRules(moved(card, pmCol), newRuleChain())
    assert.equal((await columnOf(card)).columnId, pmCol)
  } finally {
    await db.update(projects).set({ crewRulesOn: true }).where(eq(projects.id, crew))
  }
  // Control: the same situation with the switch on moves the card to To do, so the test above is not vacuous.
  await db.delete(projectTasks).where(eq(projectTasks.id, card))
  await fresh()
  await fireRules(moved(card, pmCol), newRuleChain())
  assert.equal((await columnOf(card)).columnId, cols.todo)
})

test('failing-test clock: a card in Blocked tagged test failing gets one note to Pia at 15 minutes and one to Boss at 45', async () => {
  const entered = now - 16 * MIN
  await db.insert(taskActivity).values({ id: id('act-blocked'), taskId: t.test!, projectId: crew, actorId: people.worker, via: 'ui', kind: 'moved', detail: { to: 'Blocked' }, createdAt: entered })
  await sweepTestClock(now)
  let notes = await comments(t.test!)
  assert.equal(notes.filter(note => /@pia/.test(note.body)).length, 1)
  assert.equal(notes.filter(note => /@boss/.test(note.body)).length, 0)
  // A second sweep for the same stay sends nothing.
  await sweepTestClock(now)
  notes = await comments(t.test!)
  assert.equal(notes.length, 1)
  // At 46 minutes the card gets its one note to Boss, and Pia's note is not repeated.
  await sweepTestClock(entered + 46 * MIN)
  notes = await comments(t.test!)
  assert.equal(notes.filter(note => /@boss/.test(note.body)).length, 1)
  assert.equal(notes.filter(note => /@pia/.test(note.body)).length, 1)
})

test('failing-test clock: a card that has left Blocked is not noted (negative)', async () => {
  const left = id('task-left')
  await db.insert(projectTasks).values({ id: left, projectId: crew, columnId: cols.inprogress!, title: 'left', visibility: 'internal', position: 11, tags: ['test failing'], createdAt: now, updatedAt: now })
  await db.insert(taskActivity).values({ id: id('act-left'), taskId: left, projectId: crew, actorId: people.worker, via: 'ui', kind: 'moved', detail: { to: 'Blocked' }, createdAt: now - 60 * MIN })
  await sweepTestClock(now)
  assert.equal((await comments(left)).length, 0)
})

// A card in Verify PM with time logged, so the time-log check leaves it for the gate routing.
const newPmCard = async (name: string) => {
  const cardId = id(`task-pm-${name}`)
  await db.insert(projectTasks).values({ id: cardId, projectId: crew, columnId: pmCol, title: name, visibility: 'internal', position: 20 + Math.floor(Math.random() * 1000), assigneeId: people.worker, tags: [], createdAt: now, updatedAt: now })
  await db.insert(timeEntries).values({ id: id(`time-${name}`), taskId: cardId, projectId: crew, userId: people.worker, minutes: 30, day: '2026-11-07', note: '', createdAt: now })
  return cardId
}
// Records a PM approval the way the route writes it: the tag on the card, and a line naming who set it.
const pmApprove = async (cardId: string, setter: string) => {
  await setTag(cardId, 'pm approved', setter)
  await db.update(projectTasks).set({ tags: ['pm approved'] }).where(eq(projectTasks.id, cardId))
  await fireRules({ type: 'tags_changed', projectId: crew, taskId: cardId, actorId: setter, actorIsAgent: false, detail: null }, newRuleChain())
}

test('gate routing: a PM approval set by Pat routes the card on, as Pia\'s does', async () => {
  const card = await newPmCard('pat-sets')
  await pmApprove(card, people.pat)
  assert.deepEqual(await columnOf(card), { columnId: cols.cq, assigneeId: people.nina })
})

test('gate routing: a PM approval set by Pia routes the card on', async () => {
  const card = await newPmCard('pia-sets')
  await pmApprove(card, people.pia)
  assert.deepEqual(await columnOf(card), { columnId: cols.cq, assigneeId: people.nina })
})

test('gate routing: a PM approval set by a worker does nothing (negative)', async () => {
  const card = await newPmCard('worker-sets')
  await pmApprove(card, people.worker)
  assert.equal((await columnOf(card)).columnId, pmCol)
})

test('pure parts: the gate order, the stages, the tag lines and the crew column set', () => {
  const ux = GATES.find(g => g.key === 'ux')!
  assert.deepEqual(gatesRequired([], []).map(g => g.key), ['cq', 'qa'])
  assert.deepEqual(gatesRequired(['verify ux'], []).map(g => g.key), ['ux', 'cq', 'qa'])
  assert.deepEqual(gatesRequired([], ['verify ux']).map(g => g.key), ['ux', 'cq', 'qa'])
  assert.equal(firstOpenGate([ux], new Set(['ux'])), null)
  assert.equal(firstOpenGate(gatesRequired([], []), new Set(['cq'])), GATES.find(g => g.key === 'qa'))
  assert.equal(hasViolation(['qa violation']), true)
  assert.equal(hasViolation(['qa approved']), false)
  assert.deepEqual(testClockStage(14 * MIN), [])
  assert.deepEqual(testClockStage(15 * MIN).map(s => s.person), ['pia'])
  assert.deepEqual(testClockStage(45 * MIN).map(s => s.person), ['pia', 'boss'])
  assert.deepEqual(tagAddEntries(['a'], ['a', 'b']), [{ kind: 'label', detail: { to: 'b' } }])
  assert.deepEqual(tagAddEntries(['a', 'b'], ['a']), [])
  assert.equal(isCrewColumnSet(['Backlog', 'Verify PM']), true)
  assert.equal(isCrewColumnSet(['To do', 'Done']), false)
})
