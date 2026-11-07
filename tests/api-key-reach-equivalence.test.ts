// The boards reachedBoardsOf lists for a key (in memory, one query) are the boards boardFilter (the SQL the MCP
// calls use) returns for the same key, for each reach shape: Select all, a whole workspace, the personal
// workspace, single boards, a customer-limited key, and a guest board. Needs the dev database. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/api-key-reach-equivalence.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { and, eq, inArray } from 'drizzle-orm'

// Nitro provides createError as a global; the helpers under test expect it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { apiKeys, apiKeyBoards, apiKeyWorkspaces, customerMembers, customers, member, organization, projectGuests, projects, user } = schema
const { boardFilter } = await import('../server/utils/mcpAccess')
const { reachedBoardsOf } = await import('../server/utils/keyReach')
const { guestProjectIdsOf } = await import('../server/utils/guests')
const { customerIdsOf } = await import('../server/utils/auth-helpers')
const { keyReachOf } = await import('../server/utils/api-keys')
const { workspacesOf } = await import('../server/utils/keyReach')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `arq-${tag}-${name}`
const now = Date.now()
const at = new Date()

const owner = id('owner')
const teamA = id('team-a')
const teamB = id('team-b')
const customer = id('customer')
const boards = {
  a1: id('board-a1'),
  a2: id('board-a2'),
  personal: id('board-personal'),
  b1: id('board-b1'),
  c1: id('board-customer'),
  g1: id('board-guest')
}
const fixtureIds = Object.values(boards)
const keys = {
  all: id('key-all'),
  workspace: id('key-workspace'),
  personal: id('key-personal'),
  fixed: id('key-fixed'),
  customer: id('key-customer'),
  guest: id('key-guest')
}

// The reach each key is given; the rows written from it are the same shape the key form writes.
const reaches: Record<keyof typeof keys, { allBoards: boolean, workspaces: (string | null)[], boards: string[], customerId: string | null }> = {
  all: { allBoards: true, workspaces: [], boards: [], customerId: null },
  workspace: { allBoards: false, workspaces: [teamA], boards: [], customerId: null },
  personal: { allBoards: false, workspaces: [null], boards: [], customerId: null },
  fixed: { allBoards: false, workspaces: [], boards: [boards.a1, boards.g1, boards.b1], customerId: null },
  customer: { allBoards: true, workspaces: [], boards: [], customerId: customer },
  guest: { allBoards: false, workspaces: [], boards: [boards.g1], customerId: null }
}

async function memberTeams(userId: string): Promise<string[]> {
  const rows = await db.select({ teamId: member.organizationId }).from(member).where(eq(member.userId, userId))
  return rows.map(row => row.teamId)
}

before(async () => {
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values([
    { id: teamA, name: 'Equiv A', slug: teamA, createdAt: at },
    { id: teamB, name: 'Equiv B', slug: teamB, createdAt: at }
  ])
  await db.insert(member).values({ id: id('member-a'), organizationId: teamA, userId: owner, role: 'owner', createdAt: at })
  await db.insert(customers).values({ id: customer, organizationId: teamB, name: 'Equiv customer', createdAt: now, updatedAt: now })
  await db.insert(customerMembers).values({ id: id('cm'), customerId: customer, userId: owner, createdAt: now })
  await db.insert(projects).values([
    { id: boards.a1, userId: owner, teamId: teamA, name: boards.a1, createdAt: now, updatedAt: now },
    { id: boards.a2, userId: owner, teamId: teamA, name: boards.a2, createdAt: now, updatedAt: now },
    { id: boards.personal, userId: owner, teamId: null, name: boards.personal, createdAt: now, updatedAt: now },
    { id: boards.b1, userId: owner, teamId: teamB, name: boards.b1, createdAt: now, updatedAt: now },
    { id: boards.c1, userId: owner, teamId: teamB, customerId: customer, name: boards.c1, createdAt: now, updatedAt: now },
    { id: boards.g1, userId: owner, teamId: teamB, name: boards.g1, createdAt: now, updatedAt: now }
  ])
  // The owner is a guest on g1 only: a board of a workspace they are not in.
  await db.insert(projectGuests).values({ id: id('guest-g1'), projectId: boards.g1, userId: owner, role: 'editor', addedBy: owner, createdAt: now })
  await db.insert(apiKeys).values(Object.entries(keys).map(([name, keyId]) => ({
    id: keyId, userId: owner, name, keyHash: id(`hash-${name}`), keyPrefix: 'arn_', createdAt: now,
    allBoards: reaches[name as keyof typeof keys].allBoards,
    boardReachSet: true,
    customerId: reaches[name as keyof typeof keys].customerId
  })))
  await db.insert(apiKeyWorkspaces).values(Object.entries(keys).flatMap(([name, keyId]) =>
    reaches[name as keyof typeof keys].workspaces.map(teamId => ({ id: id(`ws-${name}-${teamId}`), keyId, teamId, createdAt: now }))))
  await db.insert(apiKeyBoards).values(Object.entries(keys).flatMap(([name, keyId]) =>
    reaches[name as keyof typeof keys].boards.map(projectId => ({ id: id(`kb-${name}-${projectId}`), keyId, projectId, createdAt: now }))))
})

after(async () => {
  await db.delete(apiKeyBoards).where(inArray(apiKeyBoards.keyId, Object.values(keys)))
  await db.delete(apiKeyWorkspaces).where(inArray(apiKeyWorkspaces.keyId, Object.values(keys)))
  await db.delete(apiKeys).where(inArray(apiKeys.id, Object.values(keys)))
  await db.delete(projectGuests).where(inArray(projectGuests.projectId, fixtureIds))
  await db.delete(projects).where(inArray(projects.id, fixtureIds))
  await db.delete(customerMembers).where(eq(customerMembers.customerId, customer))
  await db.delete(customers).where(eq(customers.id, customer))
  await db.delete(member).where(eq(member.userId, owner))
  await db.delete(user).where(eq(user.id, owner))
  await db.delete(organization).where(inArray(organization.id, [teamA, teamB]))
  await db.$client.end()
})

// The ids boardFilter returns for the key, among the fixture boards: the SQL the MCP calls use.
async function sqlIdsOf(name: keyof typeof keys): Promise<string[]> {
  const reach = keyReachOf(
    { id: keys[name], boardReachSet: true, allBoards: reaches[name].allBoards, projectId: null, teamId: null } as never,
    reaches[name].workspaces.map(teamId => ({ teamId })),
    reaches[name].boards.map(projectId => ({ projectId }))
  )
  const context = {
    keyId: keys[name],
    keyName: name,
    userId: owner,
    teamId: null,
    customerId: reaches[name].customerId,
    projectId: null,
    scopes: ['boards:read' as const],
    reach,
    memberTeamIds: await memberTeams(owner)
  }
  const rows = await db.select({ id: projects.id }).from(projects)
    .where(and(inArray(projects.id, fixtureIds), await boardFilter(context)))
  return rows.map(row => row.id).sort()
}

// The ids reachedBoardsOf lists for the key that it does not mark read-only, among the fixture boards.
async function listedIdsOf(name: keyof typeof keys): Promise<string[]> {
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.id, keys[name]))
  const listed = (await reachedBoardsOf(owner, rows)).get(keys[name]) ?? []
  return listed.filter(board => !board.readOnly && fixtureIds.includes(board.id)).map(board => board.id).sort()
}

for (const name of Object.keys(keys) as (keyof typeof keys)[]) {
  test(`the boards listed for the ${name} key are the boards boardFilter returns for it`, async () => {
    const sql = await sqlIdsOf(name)
    assert.deepEqual(await listedIdsOf(name), sql)
  })
}

test('each reach shape exercises the boards it should: a customer board and a guest board are reached', async () => {
  assert.ok((await sqlIdsOf('customer')).includes(boards.c1), 'the customer key reaches its customer board')
  assert.ok(!(await sqlIdsOf('customer')).includes(boards.b1), 'and not the other boards of that workspace')
  assert.ok((await sqlIdsOf('guest')).includes(boards.g1), 'the guest key reaches the board the owner is a guest on')
  assert.ok((await sqlIdsOf('all')).includes(boards.g1), 'Select all reaches a guest board the owner is on')
  assert.ok(!(await sqlIdsOf('workspace')).includes(boards.g1), 'a whole workspace does not reach a guest board in another workspace')
  assert.deepEqual(await customerIdsOf(owner), [customer])
  assert.deepEqual(await guestProjectIdsOf(owner), [boards.g1])
  assert.deepEqual((await workspacesOf(owner)).map(workspace => workspace.id), [teamA])
})
