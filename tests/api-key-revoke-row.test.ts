// Revoke from a key's row: someone else cannot revoke a key, the owner's revoke removes the key at once, its secret is
// refused as revoked, and the secret table keeps the record of it. Needs the dev database with the token tables. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<your key> node --import tsx --test --test-force-exit tests/api-key-revoke-row.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { and, eq, inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { apiKeys, apiKeySecrets, user } = await import('../server/db/schema')
const { hashApiKey, refusalForSecret } = await import('../server/utils/api-keys')
const { revokeKey } = await import('../server/utils/connectTokens')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `krev-${tag}-${name}`
const owner = id('owner')
const stranger = id('stranger')
const keyId = id('key')
const now = Date.now()
const at = new Date()
const secret = `arn_${randomBytes(32).toString('base64url')}`

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
    name: 'revoke row test',
    keyHash: hashApiKey(secret),
    keyPrefix: secret.slice(0, 10),
    scopes: ['boards:read'],
    createdAt: now,
    allBoards: false,
    boardReachSet: true
  })
})

after(async () => {
  await db.delete(apiKeySecrets).where(eq(apiKeySecrets.tokenId, keyId))
  await db.delete(apiKeys).where(eq(apiKeys.id, keyId))
  await db.delete(user).where(inArray(user.id, [owner, stranger]))
})

test('someone else cannot revoke the key: it stays, and its secret still works', async () => {
  assert.equal(await revokeKey(stranger, keyId), false)
  const rows = await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.id, keyId))
  assert.equal(rows.length, 1)
  assert.equal(codeOf(await refusalForSecret(secret)), undefined)
})

test('the owner revokes it: the key row goes, the secret is refused as revoked, and the record is kept', async () => {
  assert.equal(await revokeKey(owner, keyId), true)
  const rows = await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.id, keyId))
  assert.equal(rows.length, 0)
  assert.equal(codeOf(await refusalForSecret(secret)), 'token_revoked')
  const [record] = await db.select().from(apiKeySecrets)
    .where(and(eq(apiKeySecrets.tokenId, keyId), eq(apiKeySecrets.state, 'revoked')))
  assert.ok(record, 'a revoked row is kept for the key')
  assert.equal(record.keyHash, hashApiKey(secret))
  assert.ok(record.changedAt > 0)
})

test('revoking a key that is already gone says so, and writes no second record', async () => {
  assert.equal(await revokeKey(owner, keyId), false)
  const records = await db.select().from(apiKeySecrets).where(eq(apiKeySecrets.tokenId, keyId))
  assert.equal(records.length, 1)
})
