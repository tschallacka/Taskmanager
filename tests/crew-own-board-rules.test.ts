// The built-in crew rules on a crew's own board (crews.boardId, no fork row) and on a fork's shadow board.
// Needs the scratch database (DATABASE_URL) and the Nuxt aliases (`nuxt prepare`). Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test --test-force-exit tests/crew-own-board-rules.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

// Nitro provides createError as a global; the engine and its actions expect it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { crewBoardMembers, crewBoards, crews, member, organization, projectColumns, projectTasks, projects, taskActivity, user } = schema
const { fireRules, newRuleChain } = await import('../server/utils/ruleEngine')
const { crewMemberIds } = await import('../server/utils/crewRules')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `cob-${tag}-${name}`
const now = Date.now()
// Crew slugs and the local part of a crew address are lower case letters and digits.
const slug = `own${tag}`
const address = (key: string) => `${slug}-${key}@crew.invalid`

const people = { owner: id('owner'), pia: id('pia'), pat: id('pat'), nina: id('nina'), quincy: id('quincy'), boss: id('boss'), worker: id('worker') }
const keys = { pia: 'pia', pat: 'pat', nina: 'nina', quincy: 'quincy', boss: 'boss', worker: 'worker' } as const
const team = id('team')
const ownBoard = id('own-board')
const forkReal = id('fork-real')
const forkShadow = id('fork-shadow')
// A crew whose rules run on a shadow board that has no fork member rows: its accounts must still count.
const shadowOnlyReal = id('shadow-only-real')
const shadowOnly = id('shadow-only')
// A person's ordinary board: no crew row, no crew board link. Nothing routes on it.
const ordinaryBoard = id('ordinary-board')
const shadowLink = id('shadow-link')
const crewRow = id('crew')
const forkCrew = id('fork-crew')
const link = id('link')
const cols = Object.fromEntries(['todo', 'pm', 'ux', 'cq', 'qa', 'verify'].map(name => [name, id(`col-${name}`)]))
const card = id('card')
const members = [people.owner, people.pia, people.pat, people.nina, people.quincy, people.boss, people.worker]

const columnOf = async (taskId: string) => {
  const [row] = await db.select({ columnId: projectTasks.columnId, assigneeId: projectTasks.assigneeId }).from(projectTasks).where(eq(projectTasks.id, taskId))
  return row!
}
const setTag = (taskId: string, label: string, actorId: string) => db.insert(taskActivity).values({
  id: id(`act-${label}-${Math.random().toString(36).slice(2)}`), taskId, projectId: ownBoard, actorId, via: 'ui', kind: 'label', detail: { to: label }, createdAt: Date.now()
})

before(async () => {
  const stamp = new Date()
  // Crew accounts carry the crew id, and their address names the person.
  const accounts = [
    { id: people.pia, email: address(keys.pia), crewId: crewRow },
    { id: people.pat, email: address(keys.pat), crewId: crewRow },
    { id: people.nina, email: address(keys.nina), crewId: crewRow },
    { id: people.quincy, email: address(keys.quincy), crewId: crewRow },
    { id: people.boss, email: address(keys.boss), crewId: crewRow },
    { id: people.worker, email: address(keys.worker), crewId: crewRow }
  ]
  await db.insert(user).values({ id: people.owner, name: 'owner', email: `${people.owner}@arnotes.test`, emailVerified: true, createdAt: stamp, updatedAt: stamp })
  await db.insert(organization).values({ id: team, name: 'Own board team', slug: team, createdAt: stamp })
  const board = (pid: string, name: string) => ({ id: pid, userId: people.owner, teamId: team, name, createdAt: now, updatedAt: now })
  await db.insert(projects).values([board(ownBoard, 'own crew board'), board(forkReal, 'fork real'), board(forkShadow, 'fork shadow'), board(shadowOnlyReal, 'shadow only real'), board(shadowOnly, 'shadow only'), board(ordinaryBoard, 'ordinary board')])
  const column = (cid: string, pid: string, name: string, position: number) => ({ id: cid, projectId: pid, name, position, createdAt: now })
  const columnsFor = (pid: string, prefix: string) => [
    column(`${prefix}-todo`, pid, 'To do', 1000), column(`${prefix}-pm`, pid, 'Verify PM', 3000), column(`${prefix}-ux`, pid, 'Verify UX', 4000),
    column(`${prefix}-cq`, pid, 'Verify CQ', 5000), column(`${prefix}-qa`, pid, 'Verify QA', 6000), column(`${prefix}-verify`, pid, 'Verify', 7000)
  ]
  await db.insert(projectColumns).values([
    ...columnsFor(ownBoard, cols.todo!.replace(/-todo$/, '')),
    ...columnsFor(forkShadow, id('fs')),
    ...columnsFor(shadowOnly, id('so')),
    ...columnsFor(ordinaryBoard, id('ord'))
  ])
  await db.insert(crews).values([
    { id: crewRow, slug, name: 'Own crew', teamId: team, boardId: ownBoard, createdBy: people.owner, createdAt: now },
    { id: forkCrew, slug: id('fork-slug').replace(/[^a-z0-9]/g, ''), name: 'Fork crew', teamId: team, boardId: null, createdBy: people.owner, createdAt: now }
  ])
  // The crew's accounts come once the crew row exists: an account's crew_id must name a real crew.
  await db.insert(user).values(accounts.map(a => ({ id: a.id, name: a.id, email: a.email, emailVerified: false, createdAt: stamp, updatedAt: stamp, crewId: a.crewId })))
  await db.insert(member).values(members.map(u => ({ id: id(`m-${u}`), organizationId: team, userId: u, role: u === people.owner ? 'owner' : 'member', createdAt: stamp })))
  // A fork: its members are on the real board's link row, and the crew's rules run on the shadow board.
  await db.insert(crewBoards).values({ id: link, crewId: forkCrew, projectId: forkReal, shadowProjectId: forkShadow, createdBy: people.owner, createdAt: now })
  await db.insert(crewBoardMembers).values([{ id: id('cbm-pia'), linkId: link, userId: people.pia, personKey: 'pia', agentType: 'x', createdAt: now }])
  // The same crew's shadow board with no member rows at all: the crew's accounts are found through the crew.
  await db.insert(crewBoards).values({ id: shadowLink, crewId: crewRow, projectId: shadowOnlyReal, shadowProjectId: shadowOnly, createdBy: people.owner, createdAt: now })
  // The gated card sits in Verify PM on the crew's own board.
  await db.insert(projectTasks).values({
    id: card, projectId: ownBoard, columnId: cols.pm!, title: 'card', visibility: 'internal', position: 0, tags: [], assigneeId: people.worker, createdAt: now, updatedAt: now
  })
})

after(async () => {
  await db.delete(projects).where(inArray(projects.id, [ownBoard, forkReal, forkShadow, shadowOnlyReal, shadowOnly, ordinaryBoard]))
  await db.delete(crews).where(inArray(crews.id, [crewRow, forkCrew]))
  await db.delete(organization).where(eq(organization.id, team))
  await db.delete(user).where(inArray(user.id, members))
  await db.$client.end()
})

test('members of a crew\'s own board are its accounts, keyed by the address', async () => {
  const found = await crewMemberIds(ownBoard)
  assert.equal(found.get('pia'), people.pia)
  assert.equal(found.get('pat'), people.pat)
  assert.equal(found.get('nina'), people.nina)
})

test('members of a fork are found on its real board and on its shadow board', async () => {
  assert.equal((await crewMemberIds(forkReal)).get('pia'), people.pia)
  assert.equal((await crewMemberIds(forkShadow)).get('pia'), people.pia)
})

test('members of a shadow board with no member rows are the crew\'s accounts, keyed by the address', async () => {
  const found = await crewMemberIds(shadowOnly)
  assert.equal(found.get('pia'), people.pia)
  assert.equal(found.get('nina'), people.nina)
})

test('an unrelated board has no crew members (negative)', async () => {
  assert.equal((await crewMemberIds(id('nothing'))).size, 0)
})

test('gate routing on a crew\'s own board: a PM approval set by Pat moves the card to Verify CQ for Nina', async () => {
  await setTag(card, 'pm approved', people.pat)
  await db.update(projectTasks).set({ tags: ['pm approved'] }).where(eq(projectTasks.id, card))
  await fireRules({ type: 'tags_changed', projectId: ownBoard, taskId: card, actorId: people.pat, actorIsAgent: false, detail: null }, newRuleChain())
  assert.deepEqual(await columnOf(card), { columnId: cols.cq, assigneeId: people.nina })
})

test('gate routing on a crew\'s own board: the whole chain, Nina then Quincy, ends in Verify for Boss', async () => {
  const chain = id('card-chain')
  await db.insert(projectTasks).values({ id: chain, projectId: ownBoard, columnId: cols.pm!, title: 'chain', visibility: 'internal', position: 2, tags: [], assigneeId: people.worker, createdAt: now, updatedAt: now })
  // Pat approves the PM pre-check: the card goes to Verify CQ for Nina.
  await setTag(chain, 'pm approved', people.pat)
  await db.update(projectTasks).set({ tags: ['pm approved'] }).where(eq(projectTasks.id, chain))
  await fireRules({ type: 'tags_changed', projectId: ownBoard, taskId: chain, actorId: people.pat, actorIsAgent: false, detail: null }, newRuleChain())
  assert.deepEqual(await columnOf(chain), { columnId: cols.cq, assigneeId: people.nina })
  // Nina approves CQ; the card is back in Verify PM, and Pat approves again: Verify QA for Quincy.
  await setTag(chain, 'cq approved', people.nina)
  await db.update(projectTasks).set({ tags: ['pm approved', 'cq approved'], columnId: cols.pm! }).where(eq(projectTasks.id, chain))
  await setTag(chain, 'pm approved', people.pat)
  await fireRules({ type: 'tags_changed', projectId: ownBoard, taskId: chain, actorId: people.pat, actorIsAgent: false, detail: null }, newRuleChain())
  assert.deepEqual(await columnOf(chain), { columnId: cols.qa, assigneeId: people.quincy })
  // Quincy approves QA; back in Verify PM, Pat approves again: Verify for Boss.
  await setTag(chain, 'qa approved', people.quincy)
  await db.update(projectTasks).set({ tags: ['pm approved', 'cq approved', 'qa approved'], columnId: cols.pm! }).where(eq(projectTasks.id, chain))
  await setTag(chain, 'pm approved', people.pat)
  await fireRules({ type: 'tags_changed', projectId: ownBoard, taskId: chain, actorId: people.pat, actorIsAgent: false, detail: null }, newRuleChain())
  assert.deepEqual(await columnOf(chain), { columnId: cols.verify, assigneeId: people.boss })
})

test('gate routing on a shadow board: a PM approval set by Pat moves the card to Verify CQ for Nina', async () => {
  const shadowCard = id('card-shadow')
  const pmColumn = `${id('so')}-pm`
  await db.insert(projectTasks).values({ id: shadowCard, projectId: shadowOnly, columnId: pmColumn, title: 'shadow card', visibility: 'internal', position: 0, tags: [], assigneeId: people.worker, createdAt: now, updatedAt: now })
  await setTag(shadowCard, 'pm approved', people.pat)
  await db.update(projectTasks).set({ tags: ['pm approved'] }).where(eq(projectTasks.id, shadowCard))
  await fireRules({ type: 'tags_changed', projectId: shadowOnly, taskId: shadowCard, actorId: people.pat, actorIsAgent: false, detail: null }, newRuleChain())
  assert.deepEqual(await columnOf(shadowCard), { columnId: `${id('so')}-cq`, assigneeId: people.nina })
})

test('gate routing on a shadow board: a PM approval set by a worker does nothing (negative)', async () => {
  const shadowCard = id('card-shadow-worker')
  const pmColumn = `${id('so')}-pm`
  await db.insert(projectTasks).values({ id: shadowCard, projectId: shadowOnly, columnId: pmColumn, title: 'shadow worker', visibility: 'internal', position: 1, tags: ['pm approved'], assigneeId: people.worker, createdAt: now, updatedAt: now })
  await setTag(shadowCard, 'pm approved', people.worker)
  await fireRules({ type: 'tags_changed', projectId: shadowOnly, taskId: shadowCard, actorId: people.worker, actorIsAgent: false, detail: null }, newRuleChain())
  assert.equal((await columnOf(shadowCard)).columnId, pmColumn)
})

test('gate routing on an ordinary board: nothing routes, a PM approval set by Pat leaves the card in Verify PM (negative)', async () => {
  const plainCard = id('card-ordinary')
  const pmColumn = `${id('ord')}-pm`
  await db.insert(projectTasks).values({ id: plainCard, projectId: ordinaryBoard, columnId: pmColumn, title: 'ordinary card', visibility: 'internal', position: 0, tags: [], assigneeId: people.worker, createdAt: now, updatedAt: now })
  await setTag(plainCard, 'pm approved', people.pat)
  await db.update(projectTasks).set({ tags: ['pm approved'] }).where(eq(projectTasks.id, plainCard))
  await fireRules({ type: 'tags_changed', projectId: ordinaryBoard, taskId: plainCard, actorId: people.pat, actorIsAgent: false, detail: null }, newRuleChain())
  assert.deepEqual(await columnOf(plainCard), { columnId: pmColumn, assigneeId: people.worker })
})

test('gate routing on a crew\'s own board: a PM approval set by a worker does nothing (negative)', async () => {
  const other = id('card-worker')
  await db.insert(projectTasks).values({ id: other, projectId: ownBoard, columnId: cols.pm!, title: 'other', visibility: 'internal', position: 1, tags: ['pm approved'], assigneeId: people.worker, createdAt: now, updatedAt: now })
  await setTag(other, 'pm approved', people.worker)
  await fireRules({ type: 'tags_changed', projectId: ownBoard, taskId: other, actorId: people.worker, actorIsAgent: false, detail: null }, newRuleChain())
  assert.equal((await columnOf(other)).columnId, cols.pm)
})
