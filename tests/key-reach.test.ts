// A key limited to one board or one customer: what boards it reaches, which tools it is given,
// which events it receives and what a request for such a key may name. Needs the dev
// database (DATABASE_URL) and the Nuxt aliases the tool modules import (`nuxt prepare` makes them). Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/key-reach.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

// Nitro provides createError as a global; the helpers under test expect it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { apiKeys, customers, member, organization, projects, user } = await import('../server/db/schema')
const { boardFilter, isNarrowedKey } = await import('../server/utils/mcpAccess')
const { MCP_TOOLS, WORKSPACE_WIDE_TOOLS, toolsForKey } = await import('../server/utils/mcpRegistry')
const { deliverableTo } = await import('../server/utils/agentEvents')
const { KeyLimitError, issueKey, readKeyLimit, requireLimitInTeam } = await import('../server/utils/keyIssue')
const { authenticateApiKey } = await import('../server/utils/api-keys')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `reach-${tag}-${name}`
const now = Date.now()

const me = id('me')
const team = id('team')
const otherTeam = id('other-team')
const customerA = id('customer-a')
const customerB = id('customer-b')
const foreignCustomer = id('customer-foreign')
const board = { a1: id('a1'), a2: id('a2'), b1: id('b1'), loose: id('loose'), foreign: id('foreign') }

const base = { keyId: 'k', keyName: 'k', userId: me, teamId: team, scopes: ['boards:read', 'boards:write'] as ('boards:read' | 'boards:write')[] }
// These keys carry their limit in the key row, as a key made before the reach tables does. The reach
// the server derives for such a key is the team, or the one board, and the owner's memberships are read
// per call; here the owner is a member of the team only.
const legacyReach = (key: { teamId: string | null, projectId: string | null }) => (key.projectId
  ? { allBoards: false, workspaceTeamIds: [], boardIds: [key.projectId] }
  : { allBoards: false, workspaceTeamIds: [key.teamId], boardIds: [] })
const withReach = <T extends { teamId: string | null, projectId: string | null }>(key: T) => ({ ...key, reach: legacyReach(key), memberTeamIds: [team] })
const teamKey = withReach({ ...base, customerId: null, projectId: null })
const projectKey = withReach({ ...base, customerId: null, projectId: board.a1 })
const customerKey = withReach({ ...base, customerId: customerA, projectId: null })

async function boardIds(context: typeof teamKey) {
  const rows = await db.select({ id: projects.id }).from(projects).where(await boardFilter(context))
  return rows.map(r => r.id).filter(boardId => Object.values(board).includes(boardId)).sort()
}

before(async () => {
  const at = new Date()
  await db.insert(user).values({ id: me, name: me, email: `${me}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values([team, otherTeam].map(t => ({ id: t, name: `Team ${t.slice(-6)}`, slug: t, createdAt: at })))
  await db.insert(member).values({ id: id('m'), organizationId: team, userId: me, role: 'admin', createdAt: at })
  await db.insert(customers).values([
    { id: customerA, organizationId: team, name: 'Customer A', createdAt: now, updatedAt: now },
    { id: customerB, organizationId: team, name: 'Customer B', createdAt: now, updatedAt: now },
    { id: foreignCustomer, organizationId: otherTeam, name: 'Foreign', createdAt: now, updatedAt: now }
  ])
  const row = (pid: string, teamId: string, customerId: string | null) => ({ id: pid, userId: me, teamId, customerId, name: pid.slice(-8), createdAt: now, updatedAt: now })
  await db.insert(projects).values([
    row(board.a1, team, customerA),
    row(board.a2, team, customerA),
    row(board.b1, team, customerB),
    row(board.loose, team, null),
    row(board.foreign, otherTeam, null)
  ])
})

after(async () => {
  await db.delete(apiKeys).where(eq(apiKeys.userId, me))
  await db.delete(projects).where(inArray(projects.id, Object.values(board)))
  await db.delete(customers).where(inArray(customers.id, [customerA, customerB, foreignCustomer]))
  await db.delete(organization).where(inArray(organization.id, [team, otherTeam]))
  await db.delete(user).where(eq(user.id, me))
  await db.$client.end()
})

test('a team key reaches every board of its team and none of another', async () => {
  assert.deepEqual(await boardIds(teamKey), [board.a1, board.a2, board.b1, board.loose].sort())
})

test('a key limited to one board reaches that board only', async () => {
  assert.deepEqual(await boardIds(projectKey), [board.a1])
})

test('a key limited to one customer reaches that customer\'s boards only', async () => {
  assert.deepEqual(await boardIds(customerKey), [board.a1, board.a2].sort())
})

test('only a key with a board or a customer counts as limited', () => {
  assert.equal(isNarrowedKey(teamKey), false)
  assert.equal(isNarrowedKey(projectKey), true)
  assert.equal(isNarrowedKey(customerKey), true)
})

test('a limited key is given no tool that works across the whole workspace', () => {
  const names = (key: typeof teamKey) => toolsForKey(key).map(tool => tool.name)
  for (const wide of WORKSPACE_WIDE_TOOLS) {
    assert.ok(names(teamKey).includes(wide), `a team key keeps ${wide}`)
    assert.ok(!names(projectKey).includes(wide), `a board key loses ${wide}`)
    assert.ok(!names(customerKey).includes(wide), `a customer key loses ${wide}`)
  }
  assert.ok(names(projectKey).includes('get_board') && names(projectKey).includes('create_task'))
})

test('every name on the workspace-wide list is a real tool', () => {
  const known = new Set(MCP_TOOLS.map(tool => tool.name))
  for (const wide of WORKSPACE_WIDE_TOOLS) assert.ok(known.has(wide), `${wide} is not a tool`)
})

test('an event reaches a limited stream only for its own board or customer', () => {
  const record = { audience: 'staff' as const, teamId: team, board: board.a1, customerId: customerA }
  assert.equal(deliverableTo(record, team, {}), true)
  assert.equal(deliverableTo(record, team, { projectId: board.a1 }), true)
  assert.equal(deliverableTo(record, team, { projectId: board.a2 }), false)
  assert.equal(deliverableTo(record, team, { customerId: customerA }), true)
  assert.equal(deliverableTo(record, team, { customerId: customerB }), false)
  assert.equal(deliverableTo({ ...record, customerId: null }, team, { customerId: customerA }), false)
})

test('a key is limited to one thing, and a limit names the team\'s own board or customer', async () => {
  assert.deepEqual(readKeyLimit({}), { customerId: null, projectId: null })
  assert.deepEqual(readKeyLimit({ projectId: board.a1, customerId: '' }), { customerId: null, projectId: board.a1 })
  assert.throws(() => readKeyLimit({ projectId: board.a1, customerId: customerA }), KeyLimitError)
  assert.throws(() => readKeyLimit({ projectId: 5 }), KeyLimitError)
  await requireLimitInTeam(team, { customerId: customerA, projectId: null })
  await requireLimitInTeam(team, { customerId: null, projectId: board.b1 })
  await assert.rejects(requireLimitInTeam(team, { customerId: foreignCustomer, projectId: null }), KeyLimitError)
  await assert.rejects(requireLimitInTeam(team, { customerId: null, projectId: board.foreign }), KeyLimitError)
})

test('an issued limited key authenticates with its limit, and goes when its board does', async () => {
  const request = { name: 'limited', scopes: ['boards:read' as const], expiresAt: null }
  const { token, key } = await issueKey({ userId: me, teamId: team, request, limit: { customerId: null, projectId: board.b1 } })
  const event = { node: { req: { headers: { authorization: `Bearer ${token}` } } }, context: {} }
  // getRequestHeader reads the node request headers.
  Object.assign(globalThis, { getRequestHeader: (_e: unknown, name: string) => (name === 'authorization' ? `Bearer ${token}` : undefined) })
  const context = await authenticateApiKey(event as never)
  assert.equal(context.projectId, board.b1)
  assert.equal(context.customerId, null)
  assert.equal(context.teamId, team)

  await db.delete(projects).where(eq(projects.id, board.b1))
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.id, key.id))
  assert.equal(rows.length, 0)
})
