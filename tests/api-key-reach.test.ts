// What an API key reaches: the grant its owner chose (Select all, one workspace, or single boards), cut
// down to what the owner can open when the call is made. Needs the dev database with the reach tables
// pushed. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/api-key-reach.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { and, eq, inArray } from 'drizzle-orm'
import type { ApiKeyContext, KeyReach } from '../server/utils/api-keys'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { apiKeys, apiKeyBoards, apiKeyWorkspaces, member, organization, projectGuests, projects, user } = await import('../server/db/schema')
const { boardFilter, audienceOf } = await import('../server/utils/mcpAccess')
const { isNarrowedReach } = await import('../server/utils/api-keys')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `akreach-${tag}-${name}`
const now = Date.now()
const at = new Date()

const owner = id('owner')
const teamA = id('team-a')
const teamB = id('team-b')
const boards = {
  a1: id('board-a1'),
  personal: id('board-personal'),
  b1: id('board-b1')
}
const created: string[] = []

async function memberTeams(userId: string): Promise<string[]> {
  const rows = await db.select({ teamId: member.organizationId }).from(member).where(eq(member.userId, userId))
  return rows.map(row => row.teamId)
}

async function contextFor(keyId: string, reach: KeyReach): Promise<ApiKeyContext> {
  return {
    keyId,
    keyName: 'reach test',
    userId: owner,
    teamId: null,
    customerId: null,
    projectId: null,
    scopes: ['boards:read'],
    reach,
    memberTeamIds: await memberTeams(owner)
  }
}

async function reachableIds(context: ApiKeyContext, ids: string[]): Promise<string[]> {
  const rows = await db.select({ id: projects.id }).from(projects)
    .where(and(inArray(projects.id, ids), await boardFilter(context)))
  return rows.map(row => row.id).sort()
}

async function addBoard(boardId: string, teamId: string | null) {
  await db.insert(projects).values({ id: boardId, userId: owner, teamId, name: boardId, createdAt: now, updatedAt: now })
  created.push(boardId)
}

const keys = {
  all: id('key-all'),
  workspace: id('key-workspace'),
  fixed: id('key-fixed')
}

before(async () => {
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values([
    { id: teamA, name: 'Reach A', slug: teamA, createdAt: at },
    { id: teamB, name: 'Reach B', slug: teamB, createdAt: at }
  ])
  await db.insert(member).values({ id: id('member-a'), organizationId: teamA, userId: owner, role: 'owner', createdAt: at })
  await addBoard(boards.a1, teamA)
  await addBoard(boards.personal, null)
  await addBoard(boards.b1, teamB)
  await db.insert(apiKeys).values([
    { id: keys.all, userId: owner, name: 'all', keyHash: id('hash-all'), keyPrefix: 'arn_', createdAt: now, allBoards: true, boardReachSet: true },
    { id: keys.workspace, userId: owner, name: 'workspace', keyHash: id('hash-workspace'), keyPrefix: 'arn_', createdAt: now, boardReachSet: true },
    { id: keys.fixed, userId: owner, name: 'fixed', keyHash: id('hash-fixed'), keyPrefix: 'arn_', createdAt: now, boardReachSet: true }
  ])
  await db.insert(apiKeyWorkspaces).values({ id: id('ws-a'), keyId: keys.workspace, teamId: teamA, createdAt: now })
  await db.insert(apiKeyBoards).values({ id: id('kb-a1'), keyId: keys.fixed, projectId: boards.a1, createdAt: now })
})

after(async () => {
  await db.delete(apiKeys).where(inArray(apiKeys.id, Object.values(keys)))
  await db.delete(projects).where(inArray(projects.id, created))
  await db.delete(member).where(eq(member.userId, owner))
  await db.delete(user).where(eq(user.id, owner))
  await db.delete(organization).where(inArray(organization.id, [teamA, teamB]))
  await db.$client.end()
})

test('Select all reaches the boards of every workspace the owner is in, and a board added later', async () => {
  const context = await contextFor(keys.all, { allBoards: true, workspaceTeamIds: [], boardIds: [] })
  const all = [boards.a1, boards.personal, boards.b1]
  assert.deepEqual(await reachableIds(context, all), [boards.a1, boards.personal].sort())
  const later = id('board-a2')
  await addBoard(later, teamA)
  assert.ok((await reachableIds(context, [later])).includes(later))
})

test('a workspace grant reaches that workspace, including a board made later, and nothing else', async () => {
  const context = await contextFor(keys.workspace, { allBoards: false, workspaceTeamIds: [teamA], boardIds: [] })
  const later = id('board-a3')
  await addBoard(later, teamA)
  assert.deepEqual(await reachableIds(context, [boards.a1, boards.personal, boards.b1, later]), [boards.a1, later].sort())
})

test('a fixed list reaches only the ticked boards, not a board made later', async () => {
  const context = await contextFor(keys.fixed, { allBoards: false, workspaceTeamIds: [], boardIds: [boards.a1] })
  assert.deepEqual(await reachableIds(context, [boards.a1, boards.personal, boards.b1]), [boards.a1])
})

test('a grant on a board the owner has no access to reaches nothing', async () => {
  const context = await contextFor(keys.fixed, { allBoards: false, workspaceTeamIds: [], boardIds: [boards.b1] })
  assert.deepEqual(await reachableIds(context, [boards.b1]), [])
})

test('a board is lost to a key as soon as its owner leaves the workspace', async () => {
  await db.delete(member).where(eq(member.userId, owner))
  try {
    // Memberships are read per call, so the owner's context is built again after the change.
    assert.deepEqual(await reachableIds(await contextFor(keys.fixed, { allBoards: false, workspaceTeamIds: [], boardIds: [boards.a1] }), [boards.a1]), [])
  } finally {
    await db.insert(member).values({ id: id('member-a-again'), organizationId: teamA, userId: owner, role: 'owner', createdAt: at })
  }
})

test('a board in another workspace is a customer board to the key, a board in the owner\'s own is staff', async () => {
  const context = await contextFor(keys.all, { allBoards: true, workspaceTeamIds: [], boardIds: [] })
  assert.equal(audienceOf(context, { id: boards.a1, userId: owner, teamId: teamA }), 'staff')
  assert.equal(audienceOf(context, { id: boards.personal, userId: owner, teamId: null }), 'staff')
  assert.equal(audienceOf(context, { id: boards.b1, userId: owner, teamId: teamB }), 'customer')
})

test('a workspace where the owner is only a guest is a customer audience, and its board is reached as a guest board', async () => {
  const guestBoard = id('board-guest')
  await addBoard(guestBoard, teamB)
  await db.insert(projectGuests).values({ id: id('guest-row'), projectId: guestBoard, userId: owner, role: 'editor', addedBy: owner, createdAt: now })
  const context = await contextFor(keys.all, { allBoards: true, workspaceTeamIds: [], boardIds: [] })
  assert.ok((await reachableIds(context, [guestBoard])).includes(guestBoard))
  assert.equal(audienceOf(context, { id: guestBoard, userId: owner, teamId: teamB }), 'customer')
})

test('a key is narrowed when it has single boards and no whole workspace, or a customer', () => {
  assert.equal(isNarrowedReach(null, { allBoards: false, workspaceTeamIds: [], boardIds: [boards.a1] }), true)
  assert.equal(isNarrowedReach(null, { allBoards: false, workspaceTeamIds: [teamA], boardIds: [] }), false)
  assert.equal(isNarrowedReach(null, { allBoards: true, workspaceTeamIds: [], boardIds: [] }), false)
  assert.equal(isNarrowedReach('some-customer', { allBoards: true, workspaceTeamIds: [], boardIds: [] }), true)
})
