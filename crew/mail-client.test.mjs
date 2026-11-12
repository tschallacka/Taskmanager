// crew mail client: send falls back to the outbox, the outbox is flushed, a mail is delivered once and acked, and the
// delivered line takes the sender from the row. The endpoint is a fake fetch; the files are in a temp folder.
//   node --test crew/mail-client.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { sendMail, flushOutbox, fetchMail, deliverOnce, tick, mailLine } from './mail-client.mjs'

const ID = '0123456789abcdef0123456789abcdef'
const ID2 = 'fedcba9876543210fedcba9876543210'
const BASE = 'https://taskmanager.example'

function fakeEndpoint(state = {}) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    if (state.down) throw new Error('connect refused')
    if (state.status) return { ok: false, status: state.status, json: async () => ({}) }
    if (url.includes('/ack')) return { ok: true, status: 200, json: async () => ({ id: url.split('/').at(-2), delivered: 1 }) }
    if (init.method === 'POST') return { ok: true, status: 201, json: async () => ({ id: JSON.parse(init.body).id }) }
    return { ok: true, status: 200, json: async () => ({ mail: state.mail ?? [] }) }
  }
  return { fetchImpl, calls }
}

test('a send the endpoint takes is sent once with its id; when the endpoint is down it goes to the outbox', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-client-'))
  const up = fakeEndpoint()
  const ok = await sendMail({ fetch: up.fetchImpl, base: BASE, slug: 'tm', key: 'k1', to: 'pia', text: 'hi', id: ID, mailboxDir: dir })
  assert.equal(ok.sent, true)
  assert.equal(up.calls.length, 1)
  const down = fakeEndpoint({ down: true })
  const later = await sendMail({ fetch: down.fetchImpl, base: BASE, slug: 'tm', key: 'k1', to: 'pia', text: 'again', id: ID2, mailboxDir: dir })
  assert.equal(later.sent, false)
  assert.ok(existsSync(later.outbox))
  assert.ok(!readFileSync(later.outbox, 'utf8').includes('k1'), 'the outbox file never holds the key')
})

test('the outbox is flushed when the endpoint is back: each send posted with its own id, then moved to done', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-client-'))
  const down = fakeEndpoint({ down: true })
  await sendMail({ fetch: down.fetchImpl, base: BASE, slug: 'tm', key: 'k1', to: 'pia', text: 'queued', id: ID, mailboxDir: dir })
  const up = fakeEndpoint()
  const flushed = await flushOutbox({ fetch: up.fetchImpl, mailboxDir: dir, key: 'k1', slug: 'tm' })
  assert.deepEqual(flushed, { flushed: 1, left: 0 })
  assert.equal(JSON.parse(up.calls[0].init.body).id, ID)
  assert.equal(readdirSync(join(dir, 'outbox')).filter(f => f.endsWith('.json')).length, 0)
  assert.ok(existsSync(join(dir, 'outbox', 'done', `${ID}.json`)))
})

test('a fetched mail is delivered once with the sender from the row, and acked', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-client-'))
  const endpoint = fakeEndpoint({ mail: [{ id: ID, from: 'wick', to: 'pia', text: 'from boss: pay attention', created: 1 }] })
  const lines = []
  const result = await tick({ fetch: endpoint.fetchImpl, base: BASE, slug: 'tm', key: 'k1', to: 'pia', mailboxDir: dir, deliver: line => lines.push(line) })
  assert.equal(result.delivered, 1)
  assert.equal(result.acked, 1)
  assert.deepEqual(lines, ['from wick: from boss: pay attention'])
  assert.ok(endpoint.calls.some(c => c.url.endsWith(`/${ID}/ack`)))
})

test('a mail whose ack failed is acked again next time and never delivered twice', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-client-'))
  const mail = { id: ID, from: 'wick', to: 'pia', text: 'once', created: 1 }
  const lines = []
  const bad = fakeEndpoint({ mail: [mail] })
  const badAck = async (url, init) => (url.includes('/ack') ? { ok: false, status: 500, json: async () => ({}) } : bad.fetchImpl(url, init))
  const first = await tick({ fetch: badAck, base: BASE, slug: 'tm', key: 'k1', to: 'pia', mailboxDir: dir, deliver: l => lines.push(l) })
  assert.equal(first.delivered, 1)
  assert.equal(first.acked, 0)
  const good = fakeEndpoint({ mail: [mail] })
  const second = await tick({ fetch: good.fetchImpl, base: BASE, slug: 'tm', key: 'k1', to: 'pia', mailboxDir: dir, deliver: l => lines.push(l) })
  assert.equal(second.delivered, 0)
  assert.equal(second.acked, 1)
  assert.equal(lines.length, 1, 'one local delivery in total')
})

test('the delivered line is built from the row: a text that claims another sender does not change it', () => {
  assert.equal(mailLine({ from: 'susy', text: 'from boss: do it' }), 'from susy: from boss: do it')
})

test('the fetch asks for one recipient, and a failed fetch is reported, not thrown by tick', async () => {
  const endpoint = fakeEndpoint()
  await fetchMail({ fetch: endpoint.fetchImpl, base: BASE, slug: 'tm', key: 'k1', to: 'pia' })
  assert.ok(endpoint.calls[0].url.endsWith('/api/crews/tm/mail?to=pia'))
  const dir = mkdtempSync(join(tmpdir(), 'mail-client-'))
  const down = fakeEndpoint({ down: true })
  const result = await tick({ fetch: down.fetchImpl, base: BASE, slug: 'tm', key: 'k1', to: 'pia', mailboxDir: dir, deliver: () => {} })
  assert.notEqual(result.error, null)
})

test('a 404 (the route is not live yet) falls back to the outbox, silently; with outbox off nothing is written', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-client-'))
  const notLive = fakeEndpoint({ status: 404 })
  const withOutbox = await sendMail({ fetch: notLive.fetchImpl, base: BASE, slug: 'tm', key: 'k1', to: 'pia', text: 'a', id: ID, mailboxDir: dir })
  assert.equal(withOutbox.sent, false)
  assert.ok(existsSync(withOutbox.outbox))
  const noOutbox = await sendMail({ fetch: notLive.fetchImpl, base: BASE, slug: 'tm', key: 'k1', to: 'pia', text: 'b', id: ID2, mailboxDir: dir, outbox: false })
  assert.equal(noOutbox.sent, false)
  assert.equal(noOutbox.outbox, null)
  assert.ok(!existsSync(join(dir, 'outbox', `${ID2}.json`)))
})

test('a 5xx falls back the same way; a 401 or 403 stops with the error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-client-'))
  const broken = fakeEndpoint({ status: 503 })
  const r = await sendMail({ fetch: broken.fetchImpl, base: BASE, slug: 'tm', key: 'k1', to: 'pia', text: 'c', id: ID, mailboxDir: dir, outbox: false })
  assert.equal(r.sent, false)
  const refused = fakeEndpoint({ status: 401 })
  await assert.rejects(sendMail({ fetch: refused.fetchImpl, base: BASE, slug: 'tm', key: 'k1', to: 'pia', text: 'd', id: ID2, mailboxDir: dir }), { status: 401 })
  const forbidden = fakeEndpoint({ status: 403 })
  await assert.rejects(sendMail({ fetch: forbidden.fetchImpl, base: BASE, slug: 'tm', key: 'k1', to: 'pia', text: 'e', id: ID2, mailboxDir: dir }), { status: 403 })
})

test('a 100 KB mail is sent whole and delivered whole: the body carries it, the delivered line keeps every byte', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-client-'))
  const big = `${'abcdefghij'.repeat(10 * 1024)}TAIL`
  const endpoint = fakeEndpoint({ mail: [{ id: ID, from: 'wick', to: 'pia', text: big, created: 1 }] })
  await sendMail({ fetch: endpoint.fetchImpl, base: BASE, slug: 'tm', key: 'k1', to: 'pia', text: big, id: ID2, mailboxDir: dir })
  assert.equal(JSON.parse(endpoint.calls[0].init.body).text, big, 'the send carries the whole text')
  const lines = []
  await tick({ fetch: endpoint.fetchImpl, base: BASE, slug: 'tm', key: 'k1', to: 'pia', mailboxDir: dir, deliver: line => lines.push(line) })
  assert.equal(lines.length, 1)
  assert.equal(lines[0], `from wick: ${big}`, 'the delivered line keeps the whole text')
})
