// Two keys with names that slug the same, created at the same time, must both succeed with different stored suffixes
// (the unique index on the person, the slug and the suffix; a conflict is retried once). And revoking the first leaves the
// second's stored name and suffix as they were. A real database test: needs the test database with the schema pushed.
// Run: TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test tests/key-issue-conflict.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const { apiKeys, user } = await import('../server/db/schema')
const { issueKey } = await import('../server/utils/keyIssue')

const tag = randomBytes(4).toString('hex')
const owner = `kic-${tag}`
const at = new Date()
const request = (name: string) => ({ name, scopes: ['boards:read'] as const, expiresAt: null }) as never

before(async () => {
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })
})

after(async () => {
  await db.delete(apiKeys).where(eq(apiKeys.userId, owner))
  await db.delete(user).where(inArray(user.id, [owner]))
})

test('two keys with names that slug the same, created at once, both succeed with different stored suffixes', async () => {
  const [a, b] = await Promise.all([
    issueKey({ userId: owner, teamId: null, request: request('Wren Worker') }),
    issueKey({ userId: owner, teamId: null, request: request('wren-worker') })
  ])
  assert.deepEqual([a.key.nameSuffix, b.key.nameSuffix].sort(), ['', '-2'], 'one keeps the plain slug, the other gets -2')
  assert.equal(a.key.nameSlug, 'wren-worker')
  assert.equal(b.key.nameSlug, 'wren-worker')
})

test('revoking the first of the two leaves the second with its stored name and suffix', async () => {
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.userId, owner))
  const first = rows.find(row => row.nameSuffix === '')!
  const second = rows.find(row => row.nameSuffix === '-2')!
  await db.delete(apiKeys).where(eq(apiKeys.id, first.id))
  const [left] = await db.select().from(apiKeys).where(eq(apiKeys.id, second.id))
  assert.equal(left!.nameSuffix, '-2', 'the second keeps its suffix')
  assert.equal(left!.nameSlug, 'wren-worker', 'and its slug')
})
