// What a crew may reach on the real board it works on: it reads it, sees every task on it, and
// writes nothing. Needs the dev database and the Nuxt aliases the tool modules import. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/crew-board-access.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

// Nitro provides createError as a global; the helpers under test expect it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { crews, member, organization, projectColumns, projectTasks, projects, user } = schema
const { attachCrew } = await import('../server/utils/crewBoards')
const { GRANT_READABLE_TOOLS, mayUseReadGrant, readGrantedBoardIds } = await import('../server/utils/crewBoardAccess')
const { boardFilter, audienceOf } = await import('../server/utils/mcpAccess')
const { MCP_TOOLS } = await import('../server/utils/mcpRegistry')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tca-${tag}-${name}`
const now = Date.now()

const boss = id('boss')
const crewMember = id('crew-member')
const stranger = id('stranger')
const realTeam = id('real-team')
const crewTeam = id('crew-team')
const crewId = id('crew')
const realBoard = id('real')
const otherBoard = id('other')
const column = id('column')
const task = id('task')

const scopes = ['boards:read', 'boards:write'] as ('boards:read' | 'boards:write')[]
const keyOf = (userId: string, teamId: string, projectId: string | null = null) =>
  ({ keyId: 'k', keyName: 'k', userId, teamId, customerId: null, projectId, scopes })
const tool = (name: string) => MCP_TOOLS.find(t => t.name === name)!

let shadowBoard = ''

before(async () => {
  const at = new Date()
  await db.insert(user).values([boss, crewMember, stranger].map(u => ({ id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })))
  await db.insert(organization).values([realTeam, crewTeam].map(t => ({ id: t, name: t, slug: t, createdAt: at })))
  await db.insert(member).values([
    { id: id('m1'), organizationId: realTeam, userId: boss, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: crewTeam, userId: boss, role: 'owner', createdAt: at },
    { id: id('m3'), organizationId: crewTeam, userId: crewMember, role: 'member', createdAt: at }
  ])
  await db.insert(crews).values({ id: crewId, slug: `tca-${tag}`, name: 'Access crew', teamId: crewTeam, createdBy: boss, createdAt: now })
  await db.update(user).set({ crewId }).where(eq(user.id, crewMember))
  await db.insert(projects).values([
    { id: realBoard, userId: boss, teamId: realTeam, name: 'Real board', createdAt: now, updatedAt: now },
    { id: otherBoard, userId: boss, teamId: realTeam, name: 'Other board', createdAt: now, updatedAt: now }
  ])
  await db.insert(projectColumns).values({ id: column, projectId: realBoard, name: 'To do', position: 0, createdAt: now })
  // An internal task: a customer would not see it, and the crew has to.
  await db.insert(projectTasks).values({ id: task, projectId: realBoard, columnId: column, title: 'Secret internal task', visibility: 'internal', position: 0, createdAt: now, updatedAt: now })
  const link = await attachCrew({ crew: (await db.select().from(crews).where(eq(crews.id, crewId)))[0]!, projectId: realBoard, teamId: realTeam, userId: boss })
  shadowBoard = link.shadowProjectId
})

after(async () => {
  const shadows = await db.select({ id: projects.id }).from(projects).where(eq(projects.teamId, crewTeam))
  await db.delete(projects).where(inArray(projects.id, [...shadows.map(s => s.id), realBoard, otherBoard]))
  await db.delete(organization).where(inArray(organization.id, [realTeam, crewTeam]))
  await db.delete(user).where(inArray(user.id, [boss, crewMember, stranger]))
  await db.$client.end()
})

const boardIds = async (context: ReturnType<typeof keyOf> & { readGrantedBoardIds?: string[] }) =>
  (await db.select({ id: projects.id }).from(projects).where(await boardFilter(context))).map(r => r.id).filter(b => [realBoard, otherBoard, shadowBoard].includes(b)).sort()

test('only a crew account has a read reach, and only on the boards its crew was given', async () => {
  assert.deepEqual(await readGrantedBoardIds(keyOf(crewMember, crewTeam)), [realBoard])
  assert.deepEqual(await readGrantedBoardIds(keyOf(boss, realTeam)), [])
  assert.deepEqual(await readGrantedBoardIds(keyOf(stranger, realTeam)), [])
})

test('a key limited to the shadow board reads only the real board that shadow is linked to', async () => {
  assert.deepEqual(await readGrantedBoardIds(keyOf(crewMember, crewTeam, shadowBoard)), [realBoard])
  assert.deepEqual(await readGrantedBoardIds(keyOf(crewMember, crewTeam, otherBoard)), [])
  assert.deepEqual(await readGrantedBoardIds({ ...keyOf(crewMember, crewTeam), customerId: 'some-customer' }), [])
})

test('without the grant the real board is not found; with it the board resolves', async () => {
  const plain = keyOf(crewMember, crewTeam)
  assert.deepEqual(await boardIds(plain), [shadowBoard])
  assert.deepEqual(await boardIds({ ...plain, readGrantedBoardIds: [realBoard] }), [realBoard, shadowBoard].sort())
  // A grant is for one board: the team's other boards stay out of reach.
  assert.ok(!(await boardIds({ ...plain, readGrantedBoardIds: [realBoard] })).includes(otherBoard))
})

test('a granted board counts as the team own for the crew, so it sees internal tasks', async () => {
  const granted = { ...keyOf(crewMember, crewTeam), readGrantedBoardIds: [realBoard] }
  assert.equal(audienceOf(granted, { id: realBoard, userId: boss, teamId: realTeam }), 'staff')
  // Without the grant, or for a board that is not granted, it is a customer's view.
  assert.equal(audienceOf(keyOf(crewMember, crewTeam), { id: realBoard, userId: boss, teamId: realTeam }), 'customer')
  assert.equal(audienceOf(granted, { id: otherBoard, userId: boss, teamId: realTeam }), 'customer')
})

test('get_task reads an internal task on the real board with the grant, and cannot find it without', async () => {
  const withGrant = { ...keyOf(crewMember, crewTeam), readGrantedBoardIds: [realBoard] }
  const read = await tool('get_task').handler({ id: task }, withGrant) as { title?: string, task?: { title?: string } }
  assert.match(JSON.stringify(read), /Secret internal task/)
  await assert.rejects(tool('get_task').handler({ id: task }, keyOf(crewMember, crewTeam)), /not in this workspace|No task/)
})

test('a write tool is never given the grant, and neither is a read that exposes secrets', () => {
  for (const name of ['create_task', 'update_task', 'move_task', 'post_task_update', 'create_column', 'update_board', 'link_github', 'log_time', 'get_project_env', 'list_project_secrets', 'list_rules', 'list_time', 'my_tasks']) {
    assert.equal(mayUseReadGrant(tool(name)), false, name)
  }
  for (const name of GRANT_READABLE_TOOLS) {
    assert.ok(tool(name), `${name} exists`)
    assert.equal(tool(name).readOnly, true, `${name} is a read`)
    assert.equal(mayUseReadGrant(tool(name)), true, name)
  }
})

test('a write on the real board with the key of a crew member is refused: the board does not resolve', async () => {
  // The dispatcher gives a write tool the key as it is, with no grant.
  await assert.rejects(
    tool('create_task').handler({ board: realBoard, column: 'To do', title: 'Sneaky' }, keyOf(crewMember, crewTeam)),
    /No board/
  )
  const rows = await db.select({ id: projectTasks.id }).from(projectTasks).where(eq(projectTasks.projectId, realBoard))
  assert.equal(rows.length, 1)
})
