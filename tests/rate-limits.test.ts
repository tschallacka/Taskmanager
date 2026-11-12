// Configurable rate limits on agent calls (server/utils/rateLimits.ts): the limits are read and checked, the counts are
// kept in the database per window, a refusal is a 429 with the wait, every level applies, and the client address
// comes from the proxy's header only when the request really comes from the proxy. Needs the dev database with the
// rate-limit tables pushed. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5432/arnotes_test node --import tsx --test tests/rate-limits.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { instanceSettings } = await import('../server/db/schema')
const {
  chargeRateLimit, describeWindow, isRateLimited, limitsFor, readRateLimits, refusalSentence, requestAddress, DEFAULT_RATE_LIMITS
} = await import('../server/utils/rateLimits')

const tag = randomBytes(4).toString('hex')

/** A fake request event: a socket from `peer` and the given headers. Enough for peerOf and the header reads. */
function eventFrom(peer: string | undefined, headers: Record<string, string> = {}) {
  return {
    node: { req: { socket: peer === undefined ? { remotePort: 1234 } : { remoteAddress: peer, remotePort: 1234 } } },
    headers: new Headers(headers)
  } as never
}

const refusedWith = (promise: Promise<unknown>) => assert.rejects(promise, (e: { statusCode?: number, data?: { code?: string } }) => e.statusCode === 429 && e.data?.code === 'rate_limited')

before(async () => {
  await db.update(instanceSettings).set({ rateLimits: null }).where(eq(instanceSettings.id, 'instance'))
})

after(async () => {
  await db.update(instanceSettings).set({ rateLimits: null }).where(eq(instanceSettings.id, 'instance'))
})

test('a limits request is checked: known kinds, whole positive numbers, null goes back to the default', () => {
  assert.deepEqual(readRateLimits({ pairing: { max: 5, windowSeconds: 600 }, tasks: null }), { pairing: { max: 5, windowSeconds: 600 } })
  assert.throws(() => readRateLimits({ nonsense: { max: 1, windowSeconds: 1 } }), (e: { statusCode?: number }) => e.statusCode === 400)
  assert.throws(() => readRateLimits({ pairing: { max: 0, windowSeconds: 600 } }), (e: { statusCode?: number }) => e.statusCode === 400)
  assert.throws(() => readRateLimits({ pairing: { max: 1.5, windowSeconds: 600 } }), (e: { statusCode?: number }) => e.statusCode === 400)
  assert.throws(() => readRateLimits({ pairing: { max: 1, windowSeconds: 0 } }), (e: { statusCode?: number }) => e.statusCode === 400)
  assert.throws(() => readRateLimits([]), (e: { statusCode?: number }) => e.statusCode === 400)
})

test('a window reads as a person says it, and a refusal names the limit, the window and the wait', () => {
  assert.equal(describeWindow(600), '10 minutes')
  assert.equal(describeWindow(3600), '1 hour')
  assert.equal(describeWindow(86400), '1 day')
  assert.equal(describeWindow(45), '45 seconds')
  const sentence = refusalSentence('pairing', { max: 10, windowSeconds: 600 }, 42)
  assert.match(sentence, /at most 10 pairing code exchanges per 10 minutes/)
  assert.match(sentence, /Try again in 42 seconds/)
  assert.match(sentence, /do not retry in a loop/)
})

test('with nothing set, the instance limit is the default for the kind', async () => {
  assert.deepEqual(await limitsFor('pairing'), [{ ...DEFAULT_RATE_LIMITS.pairing, level: 'instance' }])
})

test('the instance limit set by the admin is what applies, and a team or board adds its own limit on top', async () => {
  await db.insert(instanceSettings).values({ id: 'instance', rateLimits: { pairing: { max: 3, windowSeconds: 600 } }, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: instanceSettings.id, set: { rateLimits: { pairing: { max: 3, windowSeconds: 600 } } } })
  assert.deepEqual(await limitsFor('pairing'), [{ max: 3, windowSeconds: 600, level: 'instance' }])
  assert.deepEqual(await limitsFor('tasks'), [{ ...DEFAULT_RATE_LIMITS.tasks, level: 'instance' }], 'a kind the admin did not set keeps its default')
  await db.update(instanceSettings).set({ rateLimits: null }).where(eq(instanceSettings.id, 'instance'))
})

test('the counts hold: the call over the limit is refused with a 429 and a Retry-After, the ones before it pass', async () => {
  const subject = `address:test-${tag}`
  const limits = [{ max: 2, windowSeconds: 3600 }]
  await chargeRateLimit('pairing', subject, limits)
  await chargeRateLimit('pairing', subject, limits)
  let refusal: { data?: { retryAfter?: number }, message?: string } | null = null
  try {
    await chargeRateLimit('pairing', subject, limits)
  } catch (error) {
    refusal = error as { data?: { retryAfter?: number }, message?: string }
  }
  assert.ok(refusal, 'the third call is refused')
  assert.ok((refusal!.data?.retryAfter ?? 0) > 0, 'it says when to try again')
  assert.match(refusal!.message ?? '', /Rate limit reached/)
  assert.ok(isRateLimited(refusal), 'it is recognised as a rate limit')
  await refusedWith(chargeRateLimit('pairing', subject, limits))
  await chargeRateLimit('pairing', `address:other-${tag}`, limits)
})

test('every limit that applies must hold: a stricter board limit refuses before the instance limit is reached', async () => {
  const subject = `key:board-${tag}`
  const instance = { max: 100, windowSeconds: 3600, level: 'instance' as const }
  const board = { max: 1, windowSeconds: 3600, level: 'board' as const }
  await chargeRateLimit('tasks', subject, [instance, board])
  await refusedWith(chargeRateLimit('tasks', subject, [instance, board]))
})

test('a limit counts in its own window: another window size is counted apart', async () => {
  const subject = `user:window-${tag}`
  await chargeRateLimit('crews', subject, [{ max: 1, windowSeconds: 3600 }])
  await chargeRateLimit('crews', subject, [{ max: 5, windowSeconds: 86400 }])
  await refusedWith(chargeRateLimit('crews', subject, [{ max: 1, windowSeconds: 3600 }]))
})

test('the address counts as the proxy passed it on only from the proxy itself; a remote client cannot choose its address', () => {
  assert.equal(requestAddress(eventFrom('127.0.0.1', { 'x-real-ip': '203.0.113.9' })), '203.0.113.9', 'from the local proxy: the forwarded client')
  assert.equal(requestAddress(eventFrom('198.51.100.7', { 'x-real-ip': '203.0.113.9' })), '198.51.100.7', 'a remote caller: its own address, the header ignored')
  assert.equal(requestAddress(eventFrom('198.51.100.7', { 'x-forwarded-for': '203.0.113.9' })), '198.51.100.7', 'X-Forwarded-For is never trusted')
  assert.equal(requestAddress(eventFrom('127.0.0.1')), '127.0.0.1', 'the proxy without a forwarded address: the proxy itself')
})
