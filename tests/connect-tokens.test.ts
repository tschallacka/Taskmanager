// Token lifecycle against the database: regenerating a secret, the refusal its old secret gets, revoking,
// and the per-board grants. Needs the dev database with the token tables pushed (api_keys.kind,
// api_keys.board_scopes_set, api_key_board_scopes, api_key_secrets). Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5432/arnotes_test node --import tsx --test tests/connect-tokens.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { and, eq, inArray } from 'drizzle-orm'
import type { ApiKeyContext } from '../server/utils/api-keys'
import type { ApiKeyScope } from '../server/db/schema'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { apiKeys, apiKeyBoardScopes, apiKeySecrets, projects, user } = await import('../server/db/schema')
const { hashApiKey, refusalForSecret } = await import('../server/utils/api-keys')
const { boardFilter } = await import('../server/utils/mcpAccess')
const { regenerateKey, revokeKey, storeBoardScopes } = await import('../server/utils/connectTokens')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `ctok-${tag}-${name}`
const now = Date.now()
const at = new Date()

const owner = id('owner')
const stranger = id('stranger')
const keyId = id('key')
const boardId = id('board')
const newSecret = () => `arn_${randomBytes(32).toString('base64url')}`
const first = newSecret()
const created: string[] = []

function codeOf(refusal: unknown): unknown {
  return (refusal as { data?: { code?: string } } | null)?.data?.code
}

before(async () => {
  await db.insert(user).values([
    { id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at },
    { id: stranger, name: stranger, email: `${stranger}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at }
  ])
  await db.insert(apiKeys).values({
    id: keyId,
    userId: owner,
    name: 'token test',
    keyHash: hashApiKey(first),
    keyPrefix: first.slice(0, 10),
    scopes: ['boards:read'],
    createdAt: now,
    allBoards: false,
    boardReachSet: true
  })
  await db.insert(projects).values({ id: boardId, userId: owner, name: boardId, createdAt: now, updatedAt: now })
  created.push(boardId)
})

after(async () => {
  await db.delete(apiKeyBoardScopes).where(eq(apiKeyBoardScopes.keyId, keyId))
  await db.delete(apiKeySecrets).where(eq(apiKeySecrets.tokenId, keyId))
  await db.delete(apiKeys).where(eq(apiKeys.id, keyId))
  if (created.length) await db.delete(projects).where(inArray(projects.id, created))
  await db.delete(user).where(inArray(user.id, [owner, stranger]))
})

test('a secret never issued gets no refusal, so the caller answers the plain 401', async () => {
  assert.equal(await refusalForSecret(newSecret()), null)
})

test('a live secret gets no refusal', async () => {
  assert.equal(await refusalForSecret(first), null)
})

test('regenerating gives a new secret, and the old one is refused as regenerated', async () => {
  const { token } = await regenerateKey(owner, keyId)
  assert.notEqual(token, first)
  assert.equal(codeOf(await refusalForSecret(first)), 'token_regenerated')
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId))
  assert.equal(row!.keyHash, hashApiKey(token))
  assert.equal(row!.name, 'token test')
})

test('regenerating twice: only the newest secret works, the earlier ones are refused as regenerated', async () => {
  const { token: third } = await regenerateKey(owner, keyId)
  assert.equal(codeOf(await refusalForSecret(first)), 'token_regenerated')
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId))
  assert.equal(row!.keyHash, hashApiKey(third))
  assert.equal(await refusalForSecret(third), null)
})

test('someone else cannot regenerate or revoke the token', async () => {
  await assert.rejects(regenerateKey(stranger, keyId))
  assert.equal(await revokeKey(stranger, keyId), false)
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId))
  assert.ok(row, 'the token is still there')
})

test('storing per-board grants replaces them and marks the token as using them', async () => {
  await db.transaction(tx => storeBoardScopes(tx, keyId, { [boardId]: ['boards:read', 'boards:write'] }))
  const rows = await db.select().from(apiKeyBoardScopes).where(eq(apiKeyBoardScopes.keyId, keyId))
  assert.deepEqual(rows.map(row => row.scope).sort(), ['boards:read', 'boards:write'])
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId))
  assert.equal(row!.boardScopesSet, true)
})

test('per-board grants: a call reaches only the boards that grant its permission', async () => {
  const [boardA, boardB, boardC] = [id('boardA'), id('boardB'), id('boardC')]
  await db.insert(projects).values([boardA, boardB, boardC].map(boardId => ({ id: boardId, userId: owner, name: boardId, createdAt: now, updatedAt: now })))
  created.push(boardA, boardB, boardC)
  const ids = [boardA, boardB, boardC].sort()
  const visible = async (context: ApiKeyContext) => (await db.select({ id: projects.id }).from(projects)
    .where(and(inArray(projects.id, ids), await boardFilter(context)))).map(row => row.id).sort()
  const tokenWith = (callScope: ApiKeyScope, boardScopes: Record<string, ApiKeyScope[]> | null): ApiKeyContext => ({
    keyId,
    keyName: 'per board',
    userId: owner,
    teamId: null,
    customerId: null,
    projectId: null,
    scopes: ['boards:read', 'boards:write'],
    boardScopes,
    callScope,
    reach: { allBoards: true, workspaceTeamIds: [], boardIds: [] },
    memberTeamIds: []
  })
  // Read on A, read and write on B, nothing on C.
  const grants: Record<string, ApiKeyScope[]> = { [boardA]: ['boards:read'], [boardB]: ['boards:read', 'boards:write'] }
  assert.deepEqual(await visible(tokenWith('boards:read', grants)), [boardA, boardB].sort())
  assert.deepEqual(await visible(tokenWith('boards:write', grants)), [boardB])
  // A token without per-board grants is limited by its own scopes only, as before.
  assert.deepEqual(await visible(tokenWith('boards:write', null)), ids)
})

test('a revoked token is refused as revoked, and its row and grants are gone', async () => {
  const [current] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId))
  const currentSecretHashOnly = current!.keyHash
  assert.equal(await revokeKey(owner, keyId), true)
  const [gone] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId))
  assert.equal(gone, undefined)
  const grants = await db.select().from(apiKeyBoardScopes).where(eq(apiKeyBoardScopes.keyId, keyId))
  assert.equal(grants.length, 0)
  const [tomb] = await db.select().from(apiKeySecrets).where(eq(apiKeySecrets.keyHash, currentSecretHashOnly))
  assert.equal(tomb?.state, 'revoked')
})
