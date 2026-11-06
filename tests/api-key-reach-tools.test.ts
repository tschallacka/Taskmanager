import { reachOf } from './helpers/reach'
// Where a key's tools put a board, and which live-refresh topic a write goes to. A key that reaches
// several workspaces must say which one create_board is for. Needs the dev database. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/api-key-reach-tools.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'
import type { ApiKeyContext, KeyReach } from '../server/utils/api-keys'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { organization, projects, user, member } = await import('../server/db/schema')
const { MCP_BOARD_TOOLS } = await import('../server/utils/mcpBoardTools')
const { McpToolError } = await import('../server/utils/mcpToolKit')
const { workspaceTopicOfWrite } = await import('../server/utils/keyReach')
const { workspaceTopic } = await import('../server/utils/realtime')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `akreachtools-${tag}-${name}`
const at = new Date()

const owner = id('owner')
const teamA = id('team-a')
const teamB = id('team-b')
const created: string[] = []

function contextFor(reach: KeyReach, memberTeamIds: string[]): ApiKeyContext {
  return { keyId: id('key'), keyName: 'tools test', userId: owner, teamId: null, customerId: null, projectId: null, scopes: ['boards:write'], reach, memberTeamIds, staffTeamIds: memberTeamIds }
}

async function createBoard(context: ApiKeyContext, args: Record<string, unknown>) {
  const tool = MCP_BOARD_TOOLS.find(candidate => candidate.name === 'create_board')!
  const result = await tool.handler(args, context) as { id: string }
  created.push(result.id)
  return result
}

before(async () => {
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values([
    { id: teamA, name: 'Tools A', slug: teamA, createdAt: at },
    { id: teamB, name: 'Tools B', slug: teamB, createdAt: at }
  ])
  await db.insert(member).values([
    { id: id('member-a'), organizationId: teamA, userId: owner, role: 'owner', createdAt: at },
    { id: id('member-b'), organizationId: teamB, userId: owner, role: 'owner', createdAt: at }
  ])
})

after(async () => {
  await db.delete(projects).where(inArray(projects.id, created))
  await db.delete(member).where(eq(member.userId, owner))
  await db.delete(user).where(eq(user.id, owner))
  await db.delete(organization).where(inArray(organization.id, [teamA, teamB]))
  await db.$client.end()
})

test('a key that reaches two workspaces must say which one a new board is for', async () => {
  const context = contextFor(reachOf({ workspaces: [teamA, teamB] }), [teamA, teamB])
  await assert.rejects(createBoard(context, { name: 'No workspace' }), (error: unknown) => {
    assert.ok(error instanceof McpToolError)
    assert.match((error as Error).message, /more than one workspace/)
    return true
  })
})

test('a new board goes in the workspace the key names', async () => {
  const context = contextFor(reachOf({ workspaces: [teamA, teamB] }), [teamA, teamB])
  const board = await createBoard(context, { name: 'In B', workspace: teamB })
  const [row] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, board.id))
  assert.equal(row?.teamId, teamB)
})

test('a key cannot put a board in a workspace it does not reach', async () => {
  const context = contextFor(reachOf({ workspaces: [teamA] }), [teamA, teamB])
  await assert.rejects(createBoard(context, { name: 'Not reached', workspace: teamB }), (error: unknown) => {
    assert.ok(error instanceof McpToolError)
    assert.match((error as Error).message, /does not reach the workspace/)
    return true
  })
})

test('a key that reaches one workspace creates there without a name', async () => {
  const context = contextFor(reachOf({ workspaces: [teamA] }), [teamA, teamB])
  const board = await createBoard(context, { name: 'Only A' })
  const [row] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, board.id))
  assert.equal(row?.teamId, teamA)
})

test('a Select all key names the personal workspace for a personal board', async () => {
  const context = contextFor(reachOf({ all: true }), [teamA, teamB])
  const board = await createBoard(context, { name: 'Personal', workspace: 'personal' })
  const [row] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, board.id))
  assert.equal(row?.teamId, null)
})

test('a write on a board goes to the board\'s workspace, not the key\'s', () => {
  const userId = owner
  assert.equal(workspaceTopicOfWrite(userId, teamB, teamA), workspaceTopic(userId, teamB))
  assert.notEqual(workspaceTopicOfWrite(userId, teamB, teamA), workspaceTopic(userId, teamA))
  // Without a board, the key's own workspace is the one that changed.
  assert.equal(workspaceTopicOfWrite(userId, undefined, teamA), workspaceTopic(userId, teamA))
  assert.equal(workspaceTopicOfWrite(userId, null, teamA), workspaceTopic(userId, null))
})
