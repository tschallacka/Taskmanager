// The 10-minute management token: who may make it, what it reaches (its one board, crews:manage only), when it
// stops (expiry, a withdrawn crew permission, a revoked token), and the crew calls it may make. Needs the dev
// database with the token tables pushed. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5432/arnotes_test node --import tsx --test tests/management-token.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

// Nitro provides createError and getRequestHeader as globals; the token and crew code expect them.
Object.assign(globalThis, { createError })
let presented = ''
Object.assign(globalThis, { getRequestHeader: (_e: unknown, name: string) => (name === 'authorization' ? `Bearer ${presented}` : undefined) })
const asToken = (token: string) => {
  presented = token
  return {} as never
}

const { db } = await import('../server/db')
const { agentAudit, apiKeys, crewBoards, crews, member, organization, projects, user } = await import('../server/db/schema')
const { authenticateApiKey } = await import('../server/utils/api-keys')
const { revokeKey } = await import('../server/utils/connectTokens')
const { crewTargets } = await import('../server/utils/crewBoards')
const { requireCrewManager } = await import('../server/utils/crewProvisioning')
const { requireCreateOnOwnBoard, requireCrewOnOwnBoard, requireCrewOnlyOnOwnBoard, requireOwnBoardFor, issueManagementToken, MANAGEMENT_TOKEN_MS } = await import('../server/utils/managementToken')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `tmt-${tag}-${name}`
const now = Date.now()
const at = new Date()

const boss = id('boss')
const admin = id('admin')
const plain = id('plain')
const outsider = id('outsider')
const realTeam = id('real-team')
const otherTeam = id('other-team')
const board = {
  real: id('board-real'),
  second: id('board-second'),
  archived: id('board-archived'),
  foreign: id('board-foreign'),
  shadowA: id('shadow-a'),
  shadowB: id('shadow-b')
}
const crewSlug = `tmt-${tag}`
const crewId = id('crew')
const noRights = `tmt-${tag}-new`

const rejects = (promise: Promise<unknown>, status: number) =>
  assert.rejects(promise, (e: { statusCode?: number }) => e.statusCode === status)
const codeOf = (error: unknown) => (error as { data?: { code?: string } }).data?.code

let token = ''
let keyId = ''
let tokenCaller: Awaited<ReturnType<typeof requireCrewManager>> | null = null

before(async () => {
  await db.insert(user).values([boss, admin, plain, outsider].map(u => ({
    id: u,
    name: u,
    email: `${u}@arnotes.test`,
    emailVerified: true,
    createdAt: at,
    updatedAt: at,
    isInstanceAdmin: u === boss || u === plain
  })))
  await db.insert(organization).values([
    { id: realTeam, name: 'Real team', slug: realTeam, createdAt: at },
    { id: otherTeam, name: 'Other team', slug: otherTeam, createdAt: at }
  ])
  await db.insert(member).values([
    { id: id('m1'), organizationId: realTeam, userId: boss, role: 'owner', createdAt: at },
    { id: id('m2'), organizationId: realTeam, userId: admin, role: 'admin', createdAt: at },
    { id: id('m3'), organizationId: realTeam, userId: plain, role: 'member', createdAt: at },
    { id: id('m4'), organizationId: otherTeam, userId: outsider, role: 'owner', createdAt: at }
  ])
  await db.insert(projects).values([
    { id: board.real, userId: boss, teamId: realTeam, name: 'Office board', createdAt: now, updatedAt: now },
    { id: board.second, userId: boss, teamId: realTeam, name: 'Second board', createdAt: now, updatedAt: now },
    { id: board.archived, userId: boss, teamId: realTeam, name: 'Old board', createdAt: now, updatedAt: now, archivedAt: now },
    { id: board.foreign, userId: outsider, teamId: otherTeam, name: 'Foreign board', createdAt: now, updatedAt: now },
    { id: board.shadowA, userId: boss, teamId: otherTeam, name: 'Shadow A (crew)', createdAt: now, updatedAt: now },
    { id: board.shadowB, userId: boss, teamId: otherTeam, name: 'Shadow B (crew)', createdAt: now, updatedAt: now }
  ])
})

after(async () => {
  await db.delete(crewBoards).where(eq(crewBoards.crewId, crewId))
  await db.delete(crews).where(eq(crews.id, crewId))
  await db.delete(projects).where(inArray(projects.id, Object.values(board)))
  await db.delete(organization).where(inArray(organization.id, [realTeam, otherTeam]))
  await db.delete(user).where(inArray(user.id, [boss, admin, plain, outsider]))
})

test('only the instance admin may make the token, and only for a board in a team they run', async () => {
  await rejects(issueManagementToken(admin, board.real), 403)
  await rejects(issueManagementToken(boss, board.foreign), 403)
  await rejects(issueManagementToken(boss, board.archived), 400)
  await rejects(issueManagementToken(boss, id('no-such-board')), 404)
  await rejects(issueManagementToken(boss, ''), 400)
  await rejects(issueManagementToken(plain, board.real), 403)
})

test('the token is an expiring management key bound to one board, crews:manage only', async () => {
  const made = await issueManagementToken(boss, board.real)
  token = made.token
  keyId = made.key.id
  assert.ok(token.startsWith('arn_'))
  assert.equal(made.board.id, board.real)
  assert.ok(Math.abs(made.key.expiresAt - (Date.now() + MANAGEMENT_TOKEN_MS)) < 5_000, 'it lasts 10 minutes')
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId))
  assert.equal(row!.kind, 'management')
  assert.equal(row!.teamId, realTeam)
  assert.equal(row!.projectId, board.real)
  assert.deepEqual(row!.scopes, ['crews:manage'])
  const audit = await db.select().from(agentAudit).where(eq(agentAudit.apiKeyId, keyId))
  assert.equal(audit.length, 1, 'making it is audited')
})

test('authentication reads the token as bound to its board', async () => {
  const context = await authenticateApiKey(asToken(token))
  assert.equal(context.kind, 'management')
  assert.deepEqual(context.reach.boardIds, [board.real])
  assert.equal(context.reach.allBoards, false)
  assert.deepEqual(context.boardScopes, { [board.real]: ['crews:manage'] })
})

test('the crew calls answer for its own board only', async () => {
  tokenCaller = await requireCrewManager(asToken(token))
  assert.equal(tokenCaller.boardId, board.real)
  requireOwnBoardFor(tokenCaller, board.real)
  assert.throws(() => requireOwnBoardFor(tokenCaller!, board.second), (e: { statusCode?: number }) => e.statusCode === 403)
  await rejects(requireCreateOnOwnBoard(tokenCaller!, noRights, undefined), 403)
  await requireCreateOnOwnBoard(tokenCaller!, noRights, board.real)
  const targets = await crewTargets(boss, board.real)
  assert.deepEqual(targets.teams.map(team => team.team_id), [realTeam])
  assert.deepEqual(targets.teams[0]!.userboards.map(b => b.board_id), [board.real])
  assert.ok((await crewTargets(boss)).teams.some(team => team.userboards.some(b => b.board_id === board.second)), 'an access key still sees every board')
})

test('a crew is reached only through its own board, and a crew on other boards is not removed by it', async () => {
  await db.insert(crews).values({ id: crewId, slug: crewSlug, name: 'Management crew', teamId: otherTeam, createdBy: boss, createdAt: now })
  const [crew] = await db.select().from(crews).where(eq(crews.id, crewId))
  await rejects(requireCrewOnOwnBoard(tokenCaller!, crew!).then(() => null), 404)
  await db.insert(crewBoards).values({ id: id('link-a'), crewId, projectId: board.real, shadowProjectId: board.shadowA, createdAt: now })
  await requireCrewOnOwnBoard(tokenCaller!, crew!)
  await requireCrewOnlyOnOwnBoard(tokenCaller!, crew!)
  await db.insert(crewBoards).values({ id: id('link-b'), crewId, projectId: board.second, shadowProjectId: board.shadowB, createdAt: now })
  await rejects(requireCrewOnlyOnOwnBoard(tokenCaller!, crew!).then(() => null), 403)
})

test('an expired token answers token_expired', async () => {
  const stale = await issueManagementToken(boss, board.second, Date.now() - MANAGEMENT_TOKEN_MS - 60_000)
  const refusal = await authenticateApiKey(asToken(stale.token)).then(() => null, error => error)
  assert.equal(codeOf(refusal), 'token_expired')
  assert.match((refusal as { message: string }).message, /expired/)
})

test('a revoked token answers token_revoked', async () => {
  await revokeKey(boss, keyId)
  const refusal = await authenticateApiKey(asToken(token)).then(() => null, error => error)
  assert.equal(codeOf(refusal), 'token_revoked')
})

test('withdrawing the crew permission cuts a live token off', async () => {
  const fresh = await issueManagementToken(boss, board.real)
  await db.update(user).set({ isInstanceAdmin: false }).where(eq(user.id, boss))
  try {
    await rejects(requireCrewManager(asToken(fresh.token)), 403)
    await rejects(issueManagementToken(boss, board.real), 403)
  } finally {
    await db.update(user).set({ isInstanceAdmin: true }).where(eq(user.id, boss))
  }
})
