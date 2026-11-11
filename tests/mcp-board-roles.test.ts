// list_boards and get_board say each board's role (board, crew_home, real, shadow, taken_off), the board it works for or
// the one that works for it, whether this key may write, and one sentence for a crew key; a write refused on a real
// board says why and names the shadow board. A plain member sees `board` and nothing else changes for them. Needs the
// test database and the Nuxt aliases:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test --test-force-exit tests/mcp-board-roles.test.ts
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
const { MCP_TOOLS } = await import('../server/utils/mcpRegistry')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tmr-${tag}-${name}`
const now = Date.now()

const boss = id('boss')
const crewMember = id('crew-member')
const realMember = id('real-member')

const realTeam = id('real-team')
const crewTeam = id('crew-team')
const crewId = id('crew')
const realBoard = id('real')
const otherBoard = id('other')
const takenOff = id('taken-off')
const column = id('column')

const scopes = ['boards:read', 'boards:write'] as ('boards:read' | 'boards:write')[]
const memberOf: Record<string, string[]> = { [boss]: [realTeam, crewTeam], [crewMember]: [crewTeam], [realMember]: [realTeam] }
const keyOf = (userId: string, teamId: string) => ({
  keyId: 'k',
  keyName: 'k',
  userId,
  teamId,
  customerId: null,
  projectId: null,
  scopes,
  reach: { allBoards: false, workspaceTeamIds: [teamId], boardIds: [] },
  memberTeamIds: memberOf[userId] ?? []
})
// The key as the MCP route gives it to a read tool: with the crew read reach it may have.
const withReach = async (context: ReturnType<typeof keyOf>) => ({ ...context, callScope: 'boards:read', readGrantedBoardIds: await readGrantedBoardIds(context) })
const tool = (name: string) => MCP_TOOLS.find(t => t.name === name)!

type Row = { id: string, role: string, canWrite: boolean, note?: string, realBoard?: { id: string, name: string } | null, shadowBoard?: { id: string, name: string } | null }
const listed = async (context: ReturnType<typeof keyOf>) => {
  const answer = await tool('list_boards').handler({ limit: 200 }, await withReach(context)) as { boards: Row[] }
  return new Map(answer.boards.map(row => [row.id, row]))
}

let shadowBoard = ''
let realName = ''

before(async () => {
  const at = new Date()
  await db.insert(user).values([boss, crewMember, realMember].map(u => ({ id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })))
  await db.insert(organization).values([realTeam, crewTeam].map(t => ({ id: t, name: t, slug: t, createdAt: at })))
  await db.insert(member).values([
    { id: id('m1'), organizationId: realTeam, userId: boss, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: crewTeam, userId: boss, role: 'owner', createdAt: at },
    { id: id('m3'), organizationId: crewTeam, userId: crewMember, role: 'member', createdAt: at },
    { id: id('m4'), organizationId: realTeam, userId: realMember, role: 'member', createdAt: at }
  ])
  await db.insert(crews).values({ id: crewId, slug: `tmr-${tag}`, name: 'Roles crew', teamId: crewTeam, createdBy: boss, createdAt: now })
  await db.update(user).set({ crewId }).where(eq(user.id, crewMember))
  realName = 'Roles real board'
  await db.insert(projects).values([
    { id: realBoard, userId: boss, teamId: realTeam, name: realName, createdAt: now, updatedAt: now },
    { id: otherBoard, userId: boss, teamId: realTeam, name: 'Roles other board', createdAt: now, updatedAt: now },
    { id: takenOff, userId: boss, teamId: realTeam, name: 'Roles old crew (taken off)', createdAt: now, updatedAt: now, archivedAt: now }
  ])
  await db.insert(projectColumns).values({ id: column, projectId: realBoard, name: 'To do', position: 0, createdAt: now })
  await allowCrews(boss, realTeam, [realBoard])
  const link = await attachCrew({ crew: (await db.select().from(crews).where(eq(crews.id, crewId)))[0]!, projectId: realBoard, teamId: realTeam, userId: boss })
  shadowBoard = link.shadowProjectId
})

after(async () => {
  const shadows = await db.select({ id: projects.id }).from(projects).where(eq(projects.teamId, crewTeam))
  await db.delete(projects).where(inArray(projects.id, [...shadows.map(s => s.id), realBoard, otherBoard, takenOff]))
  await db.delete(organization).where(inArray(organization.id, [realTeam, crewTeam]))
  await db.delete(user).where(inArray(user.id, [boss, crewMember, realMember]))
  await db.delete(crews).where(eq(crews.id, crewId))
  await db.$client.end()
})

test('a crew account sees its real board as read-only with its own shadow, and its shadow as its working board', async () => {
  const rows = await listed(keyOf(crewMember, crewTeam))
  const real = rows.get(realBoard)!
  assert.equal(real.role, 'real')
  assert.equal(real.canWrite, false)
  assert.deepEqual(real.shadowBoard, { id: shadowBoard, name: `${realName} (crew)` })
  assert.match(real.note ?? '', /never writes here/)
  const shadow = rows.get(shadowBoard)!
  assert.equal(shadow.role, 'shadow')
  assert.equal(shadow.canWrite, true)
  assert.deepEqual(shadow.realBoard, { id: realBoard, name: realName })
  assert.match(shadow.note ?? '', new RegExp(`Your crew's working board for '${realName}'`))
})

test('the owner\'s team key sees the real board with its shadow and may write to it; no crew sentence for a person', async () => {
  const rows = await listed(keyOf(boss, realTeam))
  const real = rows.get(realBoard)!
  assert.equal(real.role, 'real')
  assert.equal(real.canWrite, true)
  assert.equal(real.note, undefined)
  assert.equal(real.shadowBoard?.id, shadowBoard)
})

test('a plain member sees an ordinary board as before, with no role change and no crew sentence', async () => {
  const rows = await listed(keyOf(realMember, realTeam))
  const other = rows.get(otherBoard)!
  assert.equal(other.role, 'board')
  assert.equal(other.canWrite, true)
  assert.equal(other.note, undefined)
  assert.equal(other.shadowBoard, null)
  // The crew board is not in a plain member's list at all.
  assert.equal(rows.has(shadowBoard), false)
})

test('a board detached from its crew reads as taken off, and is not writable', async () => {
  const rows = await listed(keyOf(boss, realTeam))
  const off = rows.get(takenOff)!
  assert.equal(off.role, 'taken_off')
  assert.equal(off.canWrite, false)
})

test('get_board carries the same role fields as list_boards', async () => {
  const answer = await tool('get_board').handler({ board: realBoard }, await withReach(keyOf(crewMember, crewTeam))) as Row
  assert.equal(answer.role, 'real')
  assert.equal(answer.canWrite, false)
  assert.equal(answer.shadowBoard?.id, shadowBoard)
})

test('a task update, move or comment on a real-board task is refused with the reason and the shadow board to use', async () => {
  const taskId = `tmrtask${tag}`
  await db.insert(projectTasks).values({ id: taskId, projectId: realBoard, columnId: column, title: 'Real task', visibility: 'internal', position: 1, createdAt: now, updatedAt: now })
  try {
    for (const [name, args] of [['update_task', { id: taskId, title: 'Changed' }], ['move_task', { id: taskId, column: 'To do' }], ['post_task_update', { id: taskId, body: 'Note' }]] as const) {
      await assert.rejects(
        tool(name).handler(args, keyOf(crewMember, crewTeam)),
        (error: Error) => {
          assert.match(error.message, /is the real board your crew reads; it never writes there/, name)
          assert.match(error.message, new RegExp(`\\(id ${shadowBoard}\\): use that board`), name)
          return true
        },
        name
      )
    }
    const row = await db.select({ title: projectTasks.title }).from(projectTasks).where(eq(projectTasks.id, taskId))
    assert.equal(row[0]?.title, 'Real task')
  } finally {
    await db.delete(projectTasks).where(eq(projectTasks.id, taskId))
  }
})

test('a board taken off its crew is read-only: create_task on it is refused with the reason', async () => {
  await assert.rejects(
    tool('create_task').handler({ board: takenOff, column: 'To do', title: 'Late' }, keyOf(boss, realTeam)),
    /taken off its crew, so it is read-only/
  )
  const rows = await db.select({ id: projectTasks.id }).from(projectTasks).where(eq(projectTasks.projectId, takenOff))
  assert.equal(rows.length, 0)
})

test('the crew\'s home board carries a note for a crew key', async () => {
  const home = id('home')
  await db.insert(projects).values({ id: home, userId: boss, teamId: crewTeam, name: 'Roles home', createdAt: now, updatedAt: now })
  await db.update(crews).set({ boardId: home }).where(eq(crews.id, crewId))
  try {
    const rows = await listed(keyOf(crewMember, crewTeam))
    const row = rows.get(home)!
    assert.equal(row.role, 'crew_home')
    assert.match(row.note ?? '', /home board/)
  } finally {
    await db.update(crews).set({ boardId: null }).where(eq(crews.id, crewId))
    await db.delete(projects).where(eq(projects.id, home))
  }
})

test('a crew\'s write on its real board is refused with the reason and the shadow board to use', async () => {
  await assert.rejects(
    tool('create_task').handler({ board: realBoard, column: 'To do', title: 'Sneaky' }, keyOf(crewMember, crewTeam)),
    (error: Error) => {
      assert.match(error.message, /"Roles real board" is the real board your crew reads; it never writes there\./)
      assert.match(error.message, new RegExp(`"${realName} \\(crew\\)" \\(id ${shadowBoard}\\): use that board\\.`))
      return true
    }
  )
  const rows = await db.select({ id: projectTasks.id }).from(projectTasks).where(eq(projectTasks.projectId, realBoard))
  assert.equal(rows.length, 0)
})
