// Site-wide Sprocket on Instance settings: the instance key is stored encrypted and never comes back in full, only the
// instance admin opens or saves it, a user with no key of their own is answered on the instance key while the switch
// is on, the user's own key wins and is not counted, and the per-user daily limit stops at the limit and says when it
// resets. Needs the test database with the schema pushed:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_<key> node --import tsx --test --test-force-exit tests/instance-sprocket.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })
process.env.SECRETS_ENCRYPTION_KEY ||= randomBytes(32).toString('hex')

const { db } = await import('../server/db')
const { instanceSettings, rateLimitHits, user } = await import('../server/db/schema')
const { requireInstanceAdmin } = await import('../server/utils/instanceAdmin')
const {
  chooseOpenRouterAnswer,
  instanceMessagesToday,
  instanceSprocketKey,
  nextReset,
  saveSprocketInstance,
  sprocketInstanceView,
  SPROCKET_INSTANCE_ROW_ID
} = await import('../server/utils/sprocketInstance')

const tag = randomBytes(4).toString('hex')
const admin = `isp-${tag}-admin`
const plain = `isp-${tag}-plain`
const owner = `isp-${tag}-own`
const SECRET = `sk-or-v1-${tag}-secret1234`
const now = new Date()

const userIds = [admin, plain, owner]

async function snapshot() {
  const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, SPROCKET_INSTANCE_ROW_ID))
  return row ?? null
}

before(async () => {
  await db.insert(user).values(userIds.map((id, i) => ({
    id,
    name: `isp ${i}`,
    email: `${id}@example.test`,
    emailVerified: true,
    isInstanceAdmin: id === admin,
    createdAt: now,
    updatedAt: now
  })))
})

after(async () => {
  await db.delete(rateLimitHits).where(inArray(rateLimitHits.scope, userIds.map(id => `sprocket:user:${id}`)))
  await db.delete(rateLimitHits).where(eq(rateLimitHits.scope, 'sprocket:instance'))
  await db.delete(instanceSettings).where(eq(instanceSettings.id, SPROCKET_INSTANCE_ROW_ID))
  await db.delete(user).where(inArray(user.id, userIds))
})

test('only the instance admin passes the admin check', async () => {
  const event = (id: string) => ({ context: { session: { user: { id } } } }) as never
  await requireInstanceAdmin(event(admin))
  await assert.rejects(requireInstanceAdmin(event(plain)), (e: { statusCode?: number }) => e.statusCode === 403)
})

test('the key is stored encrypted and never comes back in full', async () => {
  await saveSprocketInstance({ forEveryone: true, model: 'openai/gpt-4o-mini', apiKey: SECRET, userDailyLimit: 5, instanceDailyCap: 50 }, admin)

  const row = await snapshot()
  assert.ok(row?.sprocketOpenrouterKey)
  assert.notEqual(row.sprocketOpenrouterKey, SECRET)
  assert.ok(!row.sprocketOpenrouterKey.includes(SECRET))

  const view = await sprocketInstanceView()
  assert.equal(view.keySet, true)
  assert.equal(view.keyMasked, '••••1234')
  assert.ok(!JSON.stringify(view).includes(SECRET))
  assert.ok(!JSON.stringify(view).includes(`${tag}-secret`))
})

test('a save without apiKey keeps the stored key; null clears it', async () => {
  await saveSprocketInstance({ model: 'openai/gpt-4o-mini' }, admin)
  assert.equal((await sprocketInstanceView()).keySet, true)
  await saveSprocketInstance({ apiKey: null }, admin)
  assert.equal((await sprocketInstanceView()).keySet, false)
  await saveSprocketInstance({ apiKey: SECRET, forEveryone: true }, admin)
})

test('a user with no key of their own is answered on the instance key', async () => {
  const answer = await chooseOpenRouterAnswer(null, plain)
  assert.ok(answer)
  assert.equal(answer.by, 'instance-key')
  assert.equal(answer.apiKey, SECRET)
  assert.equal(answer.model, 'openai/gpt-4o-mini')
  assert.equal(await instanceMessagesToday(plain), 1)
})

test('the instance key answers nobody while the switch is off', async () => {
  await saveSprocketInstance({ forEveryone: false }, admin)
  assert.equal(await instanceSprocketKey(), null)
  assert.equal(await chooseOpenRouterAnswer(null, plain), null)
  await saveSprocketInstance({ forEveryone: true }, admin)
  assert.ok(await instanceSprocketKey())
})

test('the own key of a user wins and is not counted against the instance', async () => {
  const before = await instanceMessagesToday(owner)
  const answer = await chooseOpenRouterAnswer({ apiKey: 'sk-own', model: 'openai/gpt-4o' }, owner)
  assert.equal(answer?.by, 'own-key')
  assert.equal(answer?.apiKey, 'sk-own')
  assert.equal(await instanceMessagesToday(owner), before)
})

test('the per-user daily limit stops at the limit and says when it resets', async () => {
  await saveSprocketInstance({ userDailyLimit: 2, instanceDailyCap: 1000 }, admin)
  const id = `isp-${tag}-limit`
  await db.insert(user).values({ id, name: 'limit', email: `${id}@example.test`, emailVerified: true, createdAt: now, updatedAt: now })
  try {
    await chooseOpenRouterAnswer(null, id)
    await chooseOpenRouterAnswer(null, id)
    await assert.rejects(chooseOpenRouterAnswer(null, id), (e: { statusCode?: number, message?: string }) => {
      assert.equal(e.statusCode, 429)
      assert.match(e.message ?? '', /2 Sprocket messages for today/)
      assert.ok((e.message ?? '').includes(nextReset().toISOString()))
      return true
    })
    assert.equal(await instanceMessagesToday(id), 2)
  } finally {
    await db.delete(rateLimitHits).where(eq(rateLimitHits.scope, `sprocket:user:${id}`))
    await db.delete(user).where(eq(user.id, id))
  }
})

test('the instance daily cap stops everyone and leaves the user count as it was', async () => {
  await saveSprocketInstance({ userDailyLimit: 200, instanceDailyCap: 1 }, admin)
  // one message already counted for the instance today from the tests above
  await db.delete(rateLimitHits).where(eq(rateLimitHits.scope, 'sprocket:instance'))
  await chooseOpenRouterAnswer(null, owner)
  await assert.rejects(chooseOpenRouterAnswer(null, plain), (e: { statusCode?: number }) => e.statusCode === 429)
  assert.equal(await instanceMessagesToday(plain), 1)
})
