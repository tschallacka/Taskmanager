// Pairing codes against the database: making a code for a token, the one exchange that hands over the secret,
// the refusals of a used, expired or unknown code, and what a code does when its token is cut off. Needs the
// dev database with the pairing table pushed (pairing_codes). Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5432/arnotes_test node --import tsx --test tests/pairing-codes.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { and, eq, inArray } from 'drizzle-orm'
import type { ApiKeyContext } from '../server/utils/api-keys'
import type { ApiKeyScope } from '../server/db/schema'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { apiKeyBoardScopes, apiKeys, apiKeySecrets, pairingCodes, projects, user } = await import('../server/db/schema')
const { hashApiKey, refusalForSecret } = await import('../server/utils/api-keys')
const { createPairingCode, latestPairingOf, redeemPairingCode, regenerateKey, revokeKey, storeBoardScopes } = await import('../server/utils/connectTokens')
const { pairingCodeDigest, PAIRING_CODE_TTL_MS } = await import('../server/utils/pairing')
const { DEFAULT_RATE_LIMITS, chargeRateLimit } = await import('../server/utils/rateLimits')
const { boardFilter } = await import('../server/utils/mcpAccess')
const { boardScopesOf } = await import('../server/utils/connectTokenRules')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `pair-${tag}-${name}`
const now = Date.now()
const at = new Date()

const owner = id('owner')
const stranger = id('stranger')
const keyId = id('key')
const managementId = id('management')
const boardA = id('boardA')
const boardB = id('boardB')
const created: string[] = []
const secretOf = () => `arn_${randomBytes(32).toString('base64url')}`
const first = secretOf()

/** The error a promise rejects with, or fails the test when it does not reject. */
async function refusalOf(promise: Promise<unknown>): Promise<{ statusCode: number, message: string, data?: { code?: string } }> {
  try {
    await promise
  } catch (error) {
    return error as { statusCode: number, message: string, data?: { code?: string } }
  }
  assert.fail('expected a refusal')
}

before(async () => {
  await db.insert(user).values([
    { id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at },
    { id: stranger, name: stranger, email: `${stranger}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at }
  ])
  await db.insert(apiKeys).values([
    { id: keyId, userId: owner, name: 'pairing test', keyHash: hashApiKey(first), keyPrefix: first.slice(0, 10), scopes: ['boards:read', 'boards:write'], createdAt: now, allBoards: false, boardReachSet: true },
    { id: managementId, userId: owner, name: 'management test', keyHash: hashApiKey(secretOf()), keyPrefix: 'arn_mgmt', scopes: ['crews:manage'], createdAt: now, allBoards: false, boardReachSet: true, kind: 'management' }
  ])
  await db.insert(projects).values([boardA, boardB].map(boardId => ({ id: boardId, userId: owner, name: `scratch: ${boardId}`, createdAt: now, updatedAt: now })))
  created.push(boardA, boardB)
  await db.transaction(tx => storeBoardScopes(tx, keyId, { [boardA]: ['boards:read'], [boardB]: ['boards:read', 'boards:write'] }))
})

after(async () => {
  await db.delete(pairingCodes).where(inArray(pairingCodes.tokenId, [keyId, managementId]))
  await db.delete(apiKeyBoardScopes).where(eq(apiKeyBoardScopes.keyId, keyId))
  await db.delete(apiKeySecrets).where(inArray(apiKeySecrets.tokenId, [keyId, id('revocable')]))
  await db.delete(apiKeys).where(inArray(apiKeys.id, [keyId, managementId]))
  if (created.length) await db.delete(projects).where(inArray(projects.id, created))
  await db.delete(user).where(inArray(user.id, [owner, stranger]))
})

test('a code is made for the caller\'s own access token, and only its digest is stored', async () => {
  const { code, expiresAt } = await createPairingCode(owner, keyId)
  assert.match(code, /^tm-pair-/)
  assert.equal(expiresAt - Date.now() > PAIRING_CODE_TTL_MS - 60_000, true)
  const rows = await db.select().from(pairingCodes).where(eq(pairingCodes.tokenId, keyId))
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.codeHash, pairingCodeDigest(code))
  assert.equal(rows[0]!.kind, 'code')
  assert.equal(rows[0]!.usedAt, null)
  assert.ok(!JSON.stringify(rows[0]).includes(code), 'the code itself is not in the row')
  await db.delete(pairingCodes).where(eq(pairingCodes.tokenId, keyId))
})

test('someone else cannot make a code for the token', async () => {
  const refusal = await refusalOf(createPairingCode(stranger, keyId))
  assert.equal(refusal.statusCode, 404)
})

test('a management token cannot be paired', async () => {
  const refusal = await refusalOf(createPairingCode(owner, managementId))
  assert.equal(refusal.statusCode, 400)
})

test('the exchange hands over a new secret once, with the boards and permissions, and spends the code', async () => {
  const { code } = await createPairingCode(owner, keyId)
  const paired = await redeemPairingCode(code, '10.0.0.7 test-client/1.0')
  assert.notEqual(paired.token, first)
  assert.match(paired.token, /^arn_/)
  assert.equal(paired.name, 'pairing test')
  assert.deepEqual([...paired.scopes].sort(), ['boards:read', 'boards:write'])
  assert.equal(paired.allBoards, false)
  const boards = Object.fromEntries(paired.boards.map(board => [board.id, [...board.scopes].sort()]))
  assert.deepEqual(boards, { [boardA]: ['boards:read'], [boardB]: ['boards:read', 'boards:write'] })

  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId))
  assert.equal(row!.keyHash, hashApiKey(paired.token), 'the new secret is the one stored')
  const [spent] = await db.select().from(pairingCodes).where(eq(pairingCodes.codeHash, pairingCodeDigest(code)!))
  assert.ok(spent!.usedAt, 'the code is marked used')
  assert.equal(spent!.usedFrom, '10.0.0.7 test-client/1.0')
})

test('after the exchange the old secret is refused as regenerated', async () => {
  assert.equal(codeOf(await refusalForSecret(first)), 'token_regenerated')
  const [replaced] = await db.select().from(apiKeySecrets).where(eq(apiKeySecrets.keyHash, hashApiKey(first)))
  assert.equal(replaced?.state, 'replaced')
})

test('the paired-by line shows who used the code last', async () => {
  const pairing = await latestPairingOf(keyId)
  assert.ok(pairing)
  assert.equal(pairing.usedFrom, '10.0.0.7 test-client/1.0')
})

test('a used code is refused as used, with its sentence', async () => {
  const { code } = await createPairingCode(owner, keyId)
  await redeemPairingCode(code, 'first')
  const refusal = await refusalOf(redeemPairingCode(code, 'second'))
  assert.equal(refusal.data?.code, 'pairing_code_used')
  assert.match(refusal.message, /^This pairing code has already been used\./)
  const [row] = await db.select().from(pairingCodes).where(eq(pairingCodes.codeHash, pairingCodeDigest(code)!))
  assert.equal(row!.usedFrom, 'first', 'the second attempt does not take over the record')
})

test('a code past its ten minutes is refused as expired and stays unused', async () => {
  const { code } = await createPairingCode(owner, keyId, Date.now() - PAIRING_CODE_TTL_MS - 1_000)
  const refusal = await refusalOf(redeemPairingCode(code, 'late'))
  assert.equal(refusal.data?.code, 'pairing_code_expired')
  assert.match(refusal.message, /^This pairing code has expired\./)
  const [row] = await db.select().from(pairingCodes).where(eq(pairingCodes.codeHash, pairingCodeDigest(code)!))
  assert.equal(row!.usedAt, null)
})

test('a code never issued is the plain 401, with no code name', async () => {
  const refusal = await refusalOf(redeemPairingCode('tm-pair-AAAA-AAAA', 'guess'))
  assert.equal(refusal.statusCode, 401)
  assert.equal(refusal.message, 'Invalid pairing code')
  assert.equal(refusal.data, undefined)
})

test('text that is not a code is the same plain 401', async () => {
  const refusal = await refusalOf(redeemPairingCode(12345, 'guess'))
  assert.equal(refusal.statusCode, 401)
  assert.equal(refusal.data, undefined)
})

test('a token that expired after the code was made is refused as expired, and the code is not spent', async () => {
  const { code } = await createPairingCode(owner, keyId)
  await db.update(apiKeys).set({ expiresAt: Date.now() - 1_000 }).where(eq(apiKeys.id, keyId))
  try {
    const refusal = await refusalOf(redeemPairingCode(code, 'expired token'))
    assert.equal(refusal.data?.code, 'token_expired')
    const [row] = await db.select().from(pairingCodes).where(eq(pairingCodes.codeHash, pairingCodeDigest(code)!))
    assert.equal(row!.usedAt, null, 'the rollback leaves the code unused')
  } finally {
    await db.update(apiKeys).set({ expiresAt: null }).where(eq(apiKeys.id, keyId))
  }
})

test('a revoked token takes its codes with it: the code is then the plain 401', async () => {
  const revocable = id('revocable')
  await db.insert(apiKeys).values({ id: revocable, userId: owner, name: 'to revoke', keyHash: hashApiKey(secretOf()), keyPrefix: 'arn_rev', scopes: ['boards:read'], createdAt: now, allBoards: true, boardReachSet: true })
  const { code } = await createPairingCode(owner, revocable)
  assert.equal(await revokeKey(owner, revocable), true)
  const refusal = await refusalOf(redeemPairingCode(code, 'after revoke'))
  assert.equal(refusal.data, undefined)
})

test('a paired token reaches only its granted boards, with only the permissions granted there', async () => {
  const { code } = await createPairingCode(owner, keyId)
  const paired = await redeemPairingCode(code, 'boards check')
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId))
  // The grants as authenticateApiKey loads them from the rows.
  const rows = await db.select({ projectId: apiKeyBoardScopes.projectId, scope: apiKeyBoardScopes.scope })
    .from(apiKeyBoardScopes)
    .where(eq(apiKeyBoardScopes.keyId, keyId))
  const context = (callScope: ApiKeyScope): ApiKeyContext => ({
    keyId,
    keyName: row!.name,
    userId: owner,
    teamId: null,
    customerId: null,
    projectId: null,
    scopes: paired.scopes,
    boardScopes: boardScopesOf(rows),
    callScope,
    reach: { allBoards: true, workspaceTeamIds: [], boardIds: [] },
    memberTeamIds: []
  })
  const visible = async (ctx: ApiKeyContext) => (await db.select({ id: projects.id }).from(projects)
    .where(and(inArray(projects.id, [boardA, boardB]), await boardFilter(ctx)))).map(found => found.id).sort()
  assert.deepEqual(await visible(context('boards:read')), [boardA, boardB].sort())
  assert.deepEqual(await visible(context('boards:write')), [boardB])
  assert.deepEqual(await visible(context('crews:manage')), [], 'a permission the token does not carry reaches no board')
  assert.deepEqual(paired.boards.map(board => board.id).sort(), [boardA, boardB].sort())
})

test('the exchange is rate limited per address: the attempt after the limit is refused', async () => {
  const address = `203.0.113.${tag}`
  const limits = [DEFAULT_RATE_LIMITS.pairing]
  for (let i = 0; i < DEFAULT_RATE_LIMITS.pairing.max; i++) await chargeRateLimit('pairing', `address:${address}`, limits)
  await assert.rejects(chargeRateLimit('pairing', `address:${address}`, limits), (e: { statusCode?: number }) => e.statusCode === 429)
  await chargeRateLimit('pairing', `address:${address}-other`, limits)
})

test('regenerating after a pairing still makes the newest secret the only one that works', async () => {
  const { token } = await regenerateKey(owner, keyId)
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId))
  assert.equal(row!.keyHash, hashApiKey(token))
})

function codeOf(refusal: unknown): unknown {
  return (refusal as { data?: { code?: string } } | null)?.data?.code
}
