/* eslint-disable @typescript-eslint/no-explicit-any -- the replies are read loosely: each test checks the fields it names */
// The crew mail routes against a real HTTP server (h3) on the test database: the sender is the caller's own key (a body
// `from` is ignored), a member reads only its own mail (the boss key reads any), only the recipient acks (a wrong ack is
// 403), a key of another crew or a customer key is 403, a duplicate id is the same mail (409 when the mail differs),
// a text over the 1 MB safety stop is 413 with its size, a 100 KB mail round-trips whole, the pending cap is 409, an ack of
// an unknown or another crew's mail is 404, and more than 30 sends a minute
// from one sender is 429. Needs the scratch test database
// with the crew tables pushed (sh bin/reset-testdb.sh <key> <tree>).
// Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wick node --import tsx --test --test-force-exit tests/crew-mail-routes.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp, createRouter, createError, defineEventHandler, getHeader, getQuery, getRequestHeader, getRouterParam, readBody, setHeader, setResponseStatus, toNodeListener } from 'h3'
import { eq, inArray } from 'drizzle-orm'

// The route modules and the key check use Nitro's auto-imported helpers: give them the same functions here.
Object.assign(globalThis, { createError, defineEventHandler, getHeader, getQuery, getRequestHeader, getRouterParam, readBody, setHeader, setResponseStatus })

const { db } = await import('../server/db')
const { apiKeys, crewBoards, crewMail, crews, member, organization, projects, user } = await import('../server/db/schema')
const { createOrRotateCrew, purgeCrew } = await import('../server/utils/crewProvisioning')
const { cleanupMailOnWrite } = await import('../server/utils/crewMail')
const postMail = (await import('../server/api/crews/[slug]/mail/index.post')).default
const getMail = (await import('../server/api/crews/[slug]/mail/index.get')).default
const ackMail = (await import('../server/api/crews/[slug]/mail/[id]/ack.post')).default

const tag = randomBytes(4).toString('hex')
const now = Date.now()
const at = new Date()
const root = `cmr-${tag}-root`
const adminCaller = { userId: root, keyId: null, keyName: 'admin session' }
const slugA = `cmra${tag}`
const slugB = `cmrb${tag}`
const slugs = [slugA, slugB]
let server: Server
let base = ''
let keys: { A: Record<string, string>, B: Record<string, string> } = { A: {}, B: {} }

const id = (n: number) => `${tag}${n.toString(16).padStart(2, '0')}`.padEnd(32, '0').slice(0, 32)

async function call(method: string, path: string, key: string | null, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) as any : null, retryAfter: res.headers.get('retry-after') }
}

before(async () => {
  await db.insert(user).values({ id: root, name: root, email: `${root}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at, isInstanceAdmin: true })
  await db.insert(organization).values({ id: `cmr-${tag}-own`, name: 'Mail team', slug: `cmr-${tag}-team`, createdAt: at })
  await db.insert(member).values({ id: `cmr-${tag}-m1`, organizationId: `cmr-${tag}-own`, userId: root, role: 'owner', createdAt: at })
  await db.insert(projects).values({ id: `cmr-${tag}-board`, userId: root, teamId: `cmr-${tag}-own`, name: 'Mail board', createdAt: now, updatedAt: now })
  const a = await createOrRotateCrew({ slug: slugA, name: 'Mail crew A', product: { name: 'Mail A' }, rotate: false }, adminCaller)
  const b = await createOrRotateCrew({ slug: slugB, name: 'Mail crew B', product: { name: 'Mail B' }, rotate: false }, adminCaller)
  assert.equal(a.status, 201)
  assert.equal(b.status, 201)
  for (const [crew, store] of [[a, keys.A], [b, keys.B]] as const) {
    for (const [key, person] of Object.entries((crew.body as any).people as Record<string, { apiKey: string }>)) store[key] = person.apiKey
  }
  const app = createApp()
  const router = createRouter()
  router.post('/api/crews/:slug/mail', postMail)
  router.get('/api/crews/:slug/mail', getMail)
  router.post('/api/crews/:slug/mail/:id/ack', ackMail)
  app.use(router)
  server = createServer(toNodeListener(app))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(async () => {
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()))
  const left = await db.select().from(crews).where(inArray(crews.slug, slugs))
  for (const crew of left) await purgeCrew(crew)
  await db.delete(crewBoards).where(eq(crewBoards.projectId, `cmr-${tag}-board`))
  await db.delete(apiKeys).where(eq(apiKeys.userId, root))
  await db.delete(projects).where(eq(projects.id, `cmr-${tag}-board`))
  await db.delete(organization).where(eq(organization.id, `cmr-${tag}-own`))
  await db.delete(user).where(eq(user.id, root))
})

test('a member sends to another member; the recipient reads it with its own key and the sender is the caller', async () => {
  const sent = await call('POST', `/api/crews/${slugA}/mail`, keys.A.pia, { id: id(1), to: 'wick', text: 'hello wick', from: 'boss' })
  assert.equal(sent.status, 201)
  const got = await call('GET', `/api/crews/${slugA}/mail?to=wick`, keys.A.wick)
  assert.equal(got.status, 200)
  const mail = got.body.mail.find((m: any) => m.id === id(1))
  assert.ok(mail, 'the mail is pending for wick')
  assert.equal(mail.from, 'pia', 'a body from is ignored: the sender is the caller')
  assert.equal(mail.text, 'hello wick')
})

test('a member reads only its own mail; the boss key reads any recipient', async () => {
  const refused = await call('GET', `/api/crews/${slugA}/mail?to=wick`, keys.A.pia)
  assert.equal(refused.status, 403)
  const boss = await call('GET', `/api/crews/${slugA}/mail?to=wick`, keys.A.boss)
  assert.equal(boss.status, 200)
})

test('only the recipient acks; a wrong ack is 403, the recipient acks once and a second ack changes nothing', async () => {
  const wrong = await call('POST', `/api/crews/${slugA}/mail/${id(1)}/ack`, keys.A.pia, {})
  assert.equal(wrong.status, 403)
  const first = await call('POST', `/api/crews/${slugA}/mail/${id(1)}/ack`, keys.A.wick, {})
  assert.equal(first.status, 200)
  const again = await call('POST', `/api/crews/${slugA}/mail/${id(1)}/ack`, keys.A.wick, {})
  assert.equal(again.status, 200)
  assert.equal(again.body.delivered, first.body.delivered)
  const after1 = await call('GET', `/api/crews/${slugA}/mail?to=wick`, keys.A.wick)
  assert.equal(after1.body.mail.some((m: any) => m.id === id(1)), false, 'a delivered mail is no longer pending')
})

test('a key of another crew, or a customer key, cannot send: 403', async () => {
  const other = await call('POST', `/api/crews/${slugA}/mail`, keys.B.pia, { id: id(2), to: 'wick', text: 'cross' })
  assert.equal(other.status, 403)
  const customer = await call('POST', `/api/crews/${slugA}/mail`, keys.A.customer, { id: id(3), to: 'pia', text: 'customer' })
  assert.equal(customer.status, 403)
})

test('the same id with the same text is the same mail (201 again); another text is 409', async () => {
  const one = await call('POST', `/api/crews/${slugA}/mail`, keys.A.pia, { id: id(4), to: 'wren', text: 'same' })
  assert.equal(one.status, 201)
  const twice = await call('POST', `/api/crews/${slugA}/mail`, keys.A.pia, { id: id(4), to: 'wren', text: 'same' })
  assert.equal(twice.status, 201)
  const other = await call('POST', `/api/crews/${slugA}/mail`, keys.A.pia, { id: id(4), to: 'wren', text: 'different' })
  assert.equal(other.status, 409)
})

test('a bad id, an empty text, a text over the 1 MB safety stop, or a recipient that is not a member is 400, the stop says the size', async () => {
  assert.equal((await call('POST', `/api/crews/${slugA}/mail`, keys.A.pia, { id: 'nope', to: 'wick', text: 'x' })).status, 400)
  assert.equal((await call('POST', `/api/crews/${slugA}/mail`, keys.A.pia, { id: id(5), to: 'wick', text: '   ' })).status, 400)
  const over = await call('POST', `/api/crews/${slugA}/mail`, keys.A.pia, { id: id(6), to: 'wick', text: 'x'.repeat(1024 * 1024 + 1) })
  assert.equal(over.status, 413, 'over the safety stop is 413')
  assert.match(over.body.data?.error ?? '', /1048577 bytes/, 'the size reaches the sender in the body')
  assert.equal((await call('POST', `/api/crews/${slugA}/mail`, keys.A.pia, { id: id(7), to: 'customer', text: 'x' })).status, 400)
})

test('a 100 KB mail is stored, fetched and kept whole: the recipient gets the same text, byte for byte', async () => {
  const big = `${'0123456789'.repeat(10 * 1024)}END`
  assert.equal(Buffer.byteLength(big, 'utf8') > 100 * 1024, true)
  const sent = await call('POST', `/api/crews/${slugA}/mail`, keys.A.pia, { id: id(8), to: 'wynn', text: big })
  assert.equal(sent.status, 201)
  const got = await call('GET', `/api/crews/${slugA}/mail?to=wynn`, keys.A.wynn)
  assert.equal(got.status, 200)
  const mail = got.body.mail.find((m: any) => m.id === id(8))
  assert.ok(mail, 'the 100 KB mail is pending for wynn')
  assert.equal(mail.text.length, big.length)
  assert.equal(mail.text, big)
  const acked = await call('POST', `/api/crews/${slugA}/mail/${id(8)}/ack`, keys.A.wynn, {})
  assert.equal(acked.status, 200)
})

test('more than 30 sends a minute from one sender is 429 with Retry-After', async () => {
  // Sends so far from pia in this minute: the ones above that were 201. Send until the limit, then one more.
  let last = { status: 0, body: null as any, retryAfter: null as string | null }
  for (let n = 0; n < 40 && last.status !== 429; n++) {
    last = await call('POST', `/api/crews/${slugA}/mail`, keys.A.pia, { id: id(100 + n), to: 'wade', text: `burst ${n}` })
  }
  assert.equal(last.status, 429)
  assert.equal(last.retryAfter, '60')
})

test('the pending cap: a recipient with 500 undelivered mails refuses the next one with 409', async () => {
  const [crewA] = await db.select().from(crews).where(eq(crews.slug, slugA))
  const rows = Array.from({ length: 500 }, (_, n) => ({
    id: randomBytes(16).toString('hex'), crewId: crewA.id, fromKey: 'rita', toKey: 'tess', text: `backlog ${n}`, created: now, delivered: null
  }))
  await db.insert(crewMail).values(rows)
  const refused = await call('POST', `/api/crews/${slugA}/mail`, keys.A.wren, { id: id(60), to: 'tess', text: 'one more' })
  assert.equal(refused.status, 409)
  assert.match(String(refused.body.message ?? refused.body.data?.error ?? JSON.stringify(refused.body)), /500 undelivered/)
})

test('an ack of an unknown id is 404, and an ack of another crew\'s mail is 404 too', async () => {
  const unknown = await call('POST', `/api/crews/${slugA}/mail/${id(98)}/ack`, keys.A.pia, {})
  assert.equal(unknown.status, 404)
  const sent = await call('POST', `/api/crews/${slugA}/mail`, keys.A.wren, { id: id(97), to: 'wick', text: 'for wick only' })
  assert.equal(sent.status, 201)
  const other = await call('POST', `/api/crews/${slugB}/mail/${id(97)}/ack`, keys.B.wick, {})
  assert.equal(other.status, 404, 'crew B cannot see or ack crew A\'s mail')
  const stillPending = await call('GET', `/api/crews/${slugA}/mail?to=wick`, keys.A.wick)
  assert.equal(stillPending.body.mail.some((m: any) => m.id === id(97)), true, 'the mail is still pending for wick')
})

test('retention: delivered mail older than 7 days and undelivered mail older than 30 days are deleted on the next write; newer mail is kept', async () => {
  const [crewA] = await db.select().from(crews).where(eq(crews.slug, slugA))
  const day = 86400_000
  // The cleanup runs at most once a day, so the test asks for a time three days on, which is past the last run.
  const T = Date.now() + 3 * day
  const row = (fields: any) => ({ id: randomBytes(16).toString('hex'), crewId: crewA.id, fromKey: 'rita', toKey: 'quincy', text: 'retention', created: T - day, delivered: null, ...fields })
  const oldDelivered = row({ created: T - 9 * day, delivered: T - 8 * day })
  const oldUndelivered = row({ created: T - 31 * day })
  const newDelivered = row({ created: T - 7 * day, delivered: T - 6 * day })
  const newUndelivered = row({ created: T - 29 * day })
  const all = [oldDelivered, oldUndelivered, newDelivered, newUndelivered]
  await db.insert(crewMail).values(all)
  await cleanupMailOnWrite(T)
  const left = await db.select({ id: crewMail.id }).from(crewMail).where(inArray(crewMail.id, all.map(r => r.id)))
  const kept = new Set(left.map(r => r.id))
  assert.equal(kept.has(oldDelivered.id), false, 'delivered over 7 days is deleted')
  assert.equal(kept.has(oldUndelivered.id), false, 'undelivered over 30 days is deleted')
  assert.equal(kept.has(newDelivered.id), true, 'delivered under 7 days is kept')
  assert.equal(kept.has(newUndelivered.id), true, 'undelivered under 30 days is kept')
})
