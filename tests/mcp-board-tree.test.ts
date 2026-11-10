// The crew tree fields of list_boards and get_board (server/utils/mcpBoardTools.ts): a shadow board names its real
// board and its crew, a real board names the shadows its key may open, the crew's home board is labelled, and a
// "(crew)" board with no crew link stays a plain board. The data is built the way crews are stored (crew_boards and
// crews, no new column). Needs the test database and the Nuxt aliases:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test --test-force-exit tests/mcp-board-tree.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { inArray } from 'drizzle-orm'
import type { ApiKeyContext } from '../server/utils/api-keys'
import { reachOf } from './helpers/reach'

// Nitro provides createError as a global; the crew code expects it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { crewBoards, crews, member, organization, projects, user } = await import('../server/db/schema')
const { MCP_BOARD_TOOLS } = await import('../server/utils/mcpBoardTools')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `mbt-${tag}-${name}`
const now = Date.now()

const owner = id('owner')
const plain = id('plain')
const realTeam = id('real-team')
const crewTeam = id('crew-team')
const real = id('real-taskmanager')
const shadow = id('shadow-taskmanager')
const home = id('home-taskmanager')
const stray = id('shadow-stray')
const crew = id('crew-taskmanager')
const link = id('link-taskmanager')
const everyBoard = [real, shadow, home, stray]

/** A key of `owner` that reaches the given workspaces: what the MCP tools read a call from. */
function keyFor(workspaces: string[]): ApiKeyContext {
  return {
    keyId: id('key'),
    keyName: 'tree test',
    userId: owner,
    teamId: null,
    customerId: null,
    projectId: null,
    scopes: ['boards:read'],
    reach: reachOf({ workspaces }),
    memberTeamIds: [realTeam, crewTeam]
  } as unknown as ApiKeyContext
}

/** The tree fields of one board as list_boards and get_board answer them. */
interface TreeBoard {
  id: string
  role: 'board' | 'real' | 'shadow' | 'crew_home'
  realBoard: { id: string, name: string } | null
  shadows: { id: string, name: string, crewName: string }[]
  crew: { id: string, name: string } | null
}

async function callTool(name: string, args: Record<string, unknown>, context: ApiKeyContext): Promise<TreeBoard & { boards: TreeBoard[] }> {
  const tool = MCP_BOARD_TOOLS.find(candidate => candidate.name === name)!
  return await tool.handler(args, context) as TreeBoard & { boards: TreeBoard[] }
}
before(async () => {
  const at = new Date()
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values([
    { id: realTeam, name: 'Tree real', slug: realTeam, createdAt: at },
    { id: crewTeam, name: 'Tree crew', slug: crewTeam, createdAt: at }
  ])
  await db.insert(member).values([
    { id: id('m-real'), organizationId: realTeam, userId: owner, role: 'owner', createdAt: at },
    { id: id('m-crew'), organizationId: crewTeam, userId: owner, role: 'owner', createdAt: at }
  ])
  const board = (bid: string, teamId: string, name: string) =>
    ({ id: bid, userId: owner, teamId, name, createdAt: now, updatedAt: now })
  await db.insert(projects).values([
    board(real, realTeam, 'Tree Taskmanager'),
    board(shadow, crewTeam, 'Tree Taskmanager (crew)'),
    board(home, crewTeam, 'Tree Development Center'),
    board(stray, crewTeam, 'Tree Stray (crew)')
  ])
  await db.insert(crews).values({ id: crew, slug: `tt-${tag}`, name: 'taskmanager-maintenance', teamId: crewTeam, createdBy: owner, boardId: home, createdAt: now })
  await db.insert(crewBoards).values({ id: link, crewId: crew, projectId: real, shadowProjectId: shadow, createdBy: owner, createdAt: now })
})

after(async () => {
  await db.delete(crewBoards).where(inArray(crewBoards.id, [link]))
  await db.delete(projects).where(inArray(projects.id, everyBoard))
  await db.delete(crews).where(inArray(crews.id, [crew]))
  await db.delete(member).where(inArray(member.organizationId, [realTeam, crewTeam]))
  await db.delete(organization).where(inArray(organization.id, [realTeam, crewTeam]))
  await db.delete(user).where(inArray(user.id, [owner]))
  await db.$client.end()
})

test('list_boards names a shadow board its real board and crew, and a real board its shadows', async () => {
  const result = await callTool('list_boards', { limit: 200 }, keyFor([realTeam, crewTeam]))
  const row = (boardId: string) => result.boards.find((entry: { id: string }) => entry.id === boardId)

  const realRow = row(real)
  assert.equal(realRow.role, 'real')
  assert.equal(realRow.realBoard, null)
  assert.deepEqual(realRow.shadows.map((entry: { id: string }) => entry.id), [shadow])
  assert.equal(realRow.shadows[0].crewName, 'taskmanager-maintenance')

  const shadowRow = row(shadow)
  assert.equal(shadowRow.role, 'shadow')
  assert.deepEqual(shadowRow.realBoard, { id: real, name: 'Tree Taskmanager' })
  assert.equal(shadowRow.crew.name, 'taskmanager-maintenance')
  assert.deepEqual(shadowRow.shadows, [])
})

test('the crew home is labelled as the crew home, and a "(crew)" board with no link stays a plain board', async () => {
  const result = await callTool('list_boards', { limit: 200 }, keyFor([realTeam, crewTeam]))
  const row = (boardId: string) => result.boards.find((entry: { id: string }) => entry.id === boardId)

  assert.equal(row(home).role, 'crew_home')
  assert.equal(row(home).crew.name, 'taskmanager-maintenance')
  assert.equal(row(stray).role, 'board')
  assert.equal(row(stray).realBoard, null)
  assert.deepEqual(row(stray).shadows, [])
})

test('a real board names only the shadows the key may open, and get_board carries the same fields', async () => {
  // A key that reaches only the real team cannot open the crew's shadow board, so the real board names none.
  const realOnly = await callTool('get_board', { board: real, detail: 'titles' }, keyFor([realTeam]))
  // Its shadow is not named, so the real board reads as a plain board: no folder, as the list draws it.
  assert.equal(realOnly.role, 'board')
  assert.deepEqual(realOnly.shadows, [])

  const both = await callTool('get_board', { board: real, detail: 'titles' }, keyFor([realTeam, crewTeam]))
  assert.equal(both.role, 'real')
  assert.deepEqual(both.shadows.map((entry: { id: string }) => entry.id), [shadow])

  const shadowRead = await callTool('get_board', { board: shadow, detail: 'titles' }, keyFor([realTeam, crewTeam]))
  assert.equal(shadowRead.role, 'shadow')
  assert.deepEqual(shadowRead.realBoard, { id: real, name: 'Tree Taskmanager' })
})

test('a plain member of both teams, who is not the crew owner, an owner or admin, or one of the crew\'s accounts, sees no crew shadow and cannot read it', async () => {
  // The rule is hiddenCrewShadows (boardTree.ts): only the crew's owner, the owners and admins of the team the shadow
  // lives in, and the crew's own accounts see a crew board. The same rule decides the list and the search.
  const at = new Date()
  await db.insert(user).values({ id: plain, name: plain, email: `${plain}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(member).values([
    { id: id('m-plain-real'), organizationId: realTeam, userId: plain, role: 'member', createdAt: at },
    { id: id('m-plain-crew'), organizationId: crewTeam, userId: plain, role: 'member', createdAt: at }
  ])
  try {
    const context = { ...keyFor([realTeam, crewTeam]), userId: plain }
    const result = await callTool('list_boards', { limit: 200 }, context)
    const ids = result.boards.map(entry => entry.id)
    assert.ok(ids.includes(real))
    assert.ok(!ids.includes(shadow))
    assert.deepEqual(result.boards.find(entry => entry.id === real)!.shadows, [])
    await assert.rejects(callTool('get_board', { board: shadow, detail: 'titles' }, context), /No board/)
  } finally {
    await db.delete(member).where(inArray(member.userId, [plain]))
    await db.delete(user).where(inArray(user.id, [plain]))
  }
})
