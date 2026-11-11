// Who may see a crew's shadow board (the owner's rule, 2026-11-10): only the crew's owner, an owner or admin of the
// real board's team, an owner or admin of the crew's own team, and the crew's own accounts. A plain member of the real
// board's team gets 404 everywhere, as if the board did not exist: the board page, its tasks, its files, and the MCP
// reads (get_board, get_task, search_tasks). A team key acts as its owner. Needs the test database and the Nuxt aliases:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test --test-force-exit tests/crew-board-visibility.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

// Nitro provides createError as a global; the helpers under test expect it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { allowCrews } = await import('./helpers/crewLevels')
const { crews, member, organization, projectColumns, projectTasks, projects, user } = schema
const { attachCrew } = await import('../server/utils/crewBoards')
const { readGrantedBoardIds } = await import('../server/utils/crewBoardAccess')
const { requireProject, requireTask } = await import('../server/utils/projects')
const { MCP_TOOLS } = await import('../server/utils/mcpRegistry')
const { boardFilter } = await import('../server/utils/mcpAccess')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tcv-${tag}-${name}`
const now = Date.now()

// The crew's owner: owner of both teams, and the person who made the crew.
const boss = id('boss')
// Owner or admin of the real board's team only.
const realAdmin = id('real-admin')
// A plain member of the real board's team: the one who must see nothing.
const realMember = id('real-member')
// The crew's own account (user.crewId), a plain member of the crew's team.
const crewMember = id('crew-member')
// Owner or admin of the crew's own team only.
const crewTeamAdmin = id('crew-team-admin')
// A plain member of the crew's team who is no crew account.
const crewTeamMember = id('crew-team-member')
const stranger = id('stranger')

const realTeam = id('real-team')
const crewTeam = id('crew-team')
const crewId = id('crew')
const realBoard = id('real')
const column = id('column')
const realTask = id('real-task')
const shadowTaskId = `tcvshadow${tag}`

const scopes = ['boards:read', 'boards:write'] as ('boards:read' | 'boards:write')[]
const memberOf: Record<string, string[]> = {
  [boss]: [realTeam, crewTeam],
  [realAdmin]: [realTeam],
  [realMember]: [realTeam],
  [crewMember]: [crewTeam],
  [crewTeamAdmin]: [crewTeam],
  [crewTeamMember]: [crewTeam],
  [stranger]: []
}
// A key of `userId`, for the whole of `teamId`, as the server builds it from the key's owner.
const keyOf = (userId: string, teamId: string, projectId: string | null = null) => ({
  keyId: 'k',
  keyName: 'k',
  userId,
  teamId,
  customerId: null,
  projectId,
  scopes,
  reach: projectId ? { allBoards: false, workspaceTeamIds: [], boardIds: [projectId] } : { allBoards: false, workspaceTeamIds: [teamId], boardIds: [] },
  memberTeamIds: memberOf[userId] ?? []
})
const tool = (name: string) => MCP_TOOLS.find(t => t.name === name)!
const notFound = (e: { statusCode?: number }) => e.statusCode === 404

// The key as the MCP route gives it to a read tool: with the crew read reach it may have.
const withReach = async (context: ReturnType<typeof keyOf>) => ({ ...context, readGrantedBoardIds: await readGrantedBoardIds(context) })

const eventOf = (userId: string, activeTeamId: string | null, method = 'GET') =>
  ({ method, context: { session: { user: { id: userId }, session: { activeOrganizationId: activeTeamId } } } }) as unknown as Parameters<typeof requireProject>[0]

let shadowBoard = ''

before(async () => {
  const at = new Date()
  const people = [boss, realAdmin, realMember, crewMember, crewTeamAdmin, crewTeamMember, stranger]
  await db.insert(user).values(people.map(u => ({ id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })))
  await db.insert(organization).values([realTeam, crewTeam].map(t => ({ id: t, name: t, slug: t, createdAt: at })))
  await db.insert(member).values([
    { id: id('m1'), organizationId: realTeam, userId: boss, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: crewTeam, userId: boss, role: 'owner', createdAt: at },
    { id: id('m3'), organizationId: realTeam, userId: realAdmin, role: 'admin', createdAt: at },
    { id: id('m4'), organizationId: realTeam, userId: realMember, role: 'member', createdAt: at },
    { id: id('m5'), organizationId: crewTeam, userId: crewMember, role: 'member', createdAt: at },
    { id: id('m6'), organizationId: crewTeam, userId: crewTeamAdmin, role: 'admin', createdAt: at },
    { id: id('m7'), organizationId: crewTeam, userId: crewTeamMember, role: 'member', createdAt: at }
  ])
  await db.insert(crews).values({ id: crewId, slug: `tcv-${tag}`, name: 'Visibility crew', teamId: crewTeam, createdBy: boss, createdAt: now })
  await db.update(user).set({ crewId }).where(eq(user.id, crewMember))
  await db.insert(projects).values({ id: realBoard, userId: boss, teamId: realTeam, name: 'Real board', createdAt: now, updatedAt: now })
  await db.insert(projectColumns).values({ id: column, projectId: realBoard, name: 'To do', position: 0, createdAt: now })
  await db.insert(projectTasks).values({ id: realTask, projectId: realBoard, columnId: column, title: 'Real internal task', visibility: 'internal', position: 0, createdAt: now, updatedAt: now })
  await allowCrews(boss, realTeam, [realBoard])
  const link = await attachCrew({ crew: (await db.select().from(crews).where(eq(crews.id, crewId)))[0]!, projectId: realBoard, teamId: realTeam, userId: boss })
  shadowBoard = link.shadowProjectId
  // A task on the shadow board, with a title nobody outside the crew should read.
  await db.insert(projectColumns).values({ id: `${column}-shadow`, projectId: shadowBoard, name: 'To do', position: 0, createdAt: now })
  await db.insert(projectTasks).values({ id: shadowTaskId, projectId: shadowBoard, columnId: `${column}-shadow`, title: 'Crew working note', visibility: 'internal', position: 0, createdAt: now, updatedAt: now })
})

after(async () => {
  const shadows = await db.select({ id: projects.id }).from(projects).where(eq(projects.teamId, crewTeam))
  await db.delete(projects).where(inArray(projects.id, [...shadows.map(s => s.id), realBoard]))
  await db.delete(organization).where(inArray(organization.id, [realTeam, crewTeam]))
  await db.delete(user).where(inArray(user.id, [boss, realAdmin, realMember, crewMember, crewTeamAdmin, crewTeamMember, stranger]))
  await db.delete(crews).where(eq(crews.id, crewId))
  await db.$client.end()
})

// ─── The browser: the board page and its tasks ───

test('a plain member of the real board\'s team gets 404 on the shadow board, its page and its tasks', async () => {
  await assert.rejects(requireProject(eventOf(realMember, realTeam), shadowBoard), notFound)
  await assert.rejects(requireProject(eventOf(realMember, realTeam, 'POST'), shadowBoard), notFound)
  await assert.rejects(requireTask(eventOf(realMember, realTeam), shadowTaskId), notFound)
})

test('the owner, the real board\'s admin and the crew\'s owner and admin open the shadow board, read-only where they are not the crew', async () => {
  for (const [userId, teamId] of [[boss, realTeam], [realAdmin, realTeam]] as const) {
    const opened = await requireProject(eventOf(userId, teamId), shadowBoard)
    assert.equal(opened.id, shadowBoard, userId)
    assert.equal(opened.readOnly, true, userId)
  }
  // The crew's own team: its owner and admin, and the crew's own account, use the board as their own.
  for (const [userId, teamId] of [[boss, crewTeam], [crewTeamAdmin, crewTeam], [crewMember, crewTeam]] as const) {
    assert.equal((await requireProject(eventOf(userId, teamId), shadowBoard)).id, shadowBoard, userId)
  }
})

test('a plain member of the crew\'s team who is no crew account gets 404 on the shadow board', async () => {
  await assert.rejects(requireProject(eventOf(crewTeamMember, crewTeam), shadowBoard), notFound)
  await assert.rejects(requireTask(eventOf(crewTeamMember, crewTeam), shadowTaskId), notFound)
})

test('a stranger with no team gets 404 on the shadow board', async () => {
  await assert.rejects(requireProject(eventOf(stranger, null), shadowBoard), notFound)
})

// ─── The MCP: a team key acts as its owner ───

test('a plain member\'s team key is granted no shadow board, so get_board and get_task do not find it', async () => {
  const context = keyOf(realMember, realTeam)
  assert.deepEqual(await readGrantedBoardIds(context), [])
  const reach = await withReach(context)
  await assert.rejects(tool('get_board').handler({ board: shadowBoard }, reach), /No board|not/)
  await assert.rejects(tool('get_task').handler({ id: shadowTaskId }, reach), /not in this workspace|No task/)
  const visible = (await db.select({ id: projects.id }).from(projects).where(await boardFilter(reach))).map(row => row.id)
  assert.ok(!visible.includes(shadowBoard))
  // search_tasks does not turn up the shadow's task either.
  const found = await tool('search_tasks').handler({ query: 'Crew working note' }, reach)
  assert.ok(!JSON.stringify(found).includes('Crew working note'))
})

test('an admin\'s key finds the shadow\'s task by search, and a plain member\'s key does not', async () => {
  const admin = await withReach(keyOf(realAdmin, realTeam))
  assert.match(JSON.stringify(await tool('search_tasks').handler({ query: 'Crew working note' }, admin)), /Crew working note/)
  const plain = await withReach(keyOf(realMember, realTeam))
  assert.ok(!JSON.stringify(await tool('search_tasks').handler({ query: 'Crew working note' }, plain)).includes('Crew working note'))
})

test('an admin\'s team key reads the shadow board; a plain member\'s does not', async () => {
  assert.ok((await readGrantedBoardIds(keyOf(realAdmin, realTeam))).includes(shadowBoard))
  assert.ok((await readGrantedBoardIds(keyOf(boss, realTeam))).includes(shadowBoard))
  assert.ok(!(await readGrantedBoardIds(keyOf(realMember, realTeam))).includes(shadowBoard))
})

test('a plain member\'s key limited to the real board does not reach the shadow board either', async () => {
  const context = keyOf(realMember, realTeam, realBoard)
  assert.ok(!(await readGrantedBoardIds(context)).includes(shadowBoard))
})

test('the crew\'s own account reads the real board it was given, and is not granted other shadows', async () => {
  assert.deepEqual(await readGrantedBoardIds(keyOf(crewMember, crewTeam)), [realBoard])
  assert.ok(!(await readGrantedBoardIds(keyOf(crewTeamMember, crewTeam))).includes(shadowBoard))
})
