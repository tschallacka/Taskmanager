// `crew down` with fakes (no real claude, no real tmux, no mail): a part stops only after its person's own confirmation with
// the same request id; a part not confirmed is left running unless --force; parts go down in reverse order; the wrap-up
// text is in the request. Run: node --test crew/down.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { downParts, wrapUpText, isDownOk, askPerson, waitForConfirmation, deliveredToPia } from './down.mjs'
import { deliverOnce, tick } from './mail-client.mjs'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REQ = '0123456789abcdef'
const okLine = (person, requestId = REQ) => `crew down ok: ${person}; stopped; 0 unread kept; request ${requestId}; at 12:00`

function jsonResponse(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

test('a down ok counts only with the same person and request id', () => {
  assert.equal(isDownOk(okLine('wren'), 'wren', REQ), true)
  assert.equal(isDownOk(okLine('wren'), 'wren', 'ffffffffffffffff'), false, 'another request id does not confirm')
  assert.equal(isDownOk(okLine('wick'), 'wren', REQ), false, 'another person does not confirm')
  assert.equal(isDownOk('hello, all good', 'wren', REQ), false)
})

test('askPerson mails the person through the app with the request text, and never throws', async () => {
  const sent = []
  const fetch = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) })
    return jsonResponse({})
  }
  const mailboxDir = mkdtempSync(join(tmpdir(), 'down-ask-'))
  const ok = await askPerson({ fetch, base: 'https://board.example', slug: 'tm', key: 'k', person: 'wren', text: 'the request', mailboxDir, makeId: () => 'a'.repeat(32) })
  assert.equal(ok, true)
  assert.equal(sent.length, 1)
  assert.match(sent[0].url, /\/api\/crew-mail\/tm$/)
  assert.deepEqual(sent[0].body, { id: 'a'.repeat(32), to: 'wren', text: 'the request' })

  const offline = async () => {
    throw new Error('offline')
  }
  const failing = await askPerson({ fetch: offline, base: 'https://board.example', slug: 'tm', key: 'k', person: 'wren', text: 'x', mailboxDir, makeId: () => 'b'.repeat(32) })
  assert.equal(failing, true, 'an unsent mail goes to the outbox, not an error')
})

// A fake app mail route with the mailer's behaviour: the pending rows are served until each one is acked.
function fakeMailRoute(initial) {
  const pending = [...initial]
  const acked = []
  const fetch = async (url, init = {}) => {
    if (init.method === 'POST' && /\/ack$/.test(url)) {
      const id = url.split('/').at(-2)
      acked.push(id)
      const at = pending.findIndex(mail => mail.id === id)
      if (at >= 0) pending.splice(at, 1)
      return jsonResponse({})
    }
    if (init.method === 'POST') return jsonResponse({})
    return jsonResponse({ mail: pending.map(mail => ({ ...mail })) })
  }
  return { fetch, acked, pending }
}

test('waitForConfirmation reads the down ok the mailer delivered (the seen record), never the live inbox', async () => {
  const mailboxDir = mkdtempSync(join(tmpdir(), 'down-wait-'))
  const route = fakeMailRoute([
    { id: 'c'.repeat(32), from: 'wick', text: okLine('wren') },
    { id: 'd'.repeat(32), from: 'wren', text: okLine('wren') }
  ])
  const base = 'https://board.example'
  let clock = 0
  const sleep = async (ms) => {
    clock += ms
  }
  const wait = (requestId, timeoutMs = 2000) => waitForConfirmation({ mailboxDir, person: 'wren', requestId, timeoutMs, interval: 1000, now: () => clock, sleep })

  assert.equal(await wait(REQ), false, 'a reply still in the inbox, not yet delivered, does not confirm')

  const delivered = []
  const result = await tick({ fetch: route.fetch, base, slug: 'tm', key: 'k', to: 'pia', mailboxDir, deliver: line => delivered.push(line) })
  assert.equal(result.error, null)
  assert.equal(delivered.length, 2)
  assert.equal(route.pending.length, 0, 'the mailer acked both')
  assert.equal(await wait(REQ), true, 'the own down ok, delivered, confirms')
  assert.equal(await wait('ffffffffffffffff'), false, 'the same mail does not confirm another request id')
})

test('deliverOnce writes the seen record with the sender and text at mode 0600; deliveredToPia reads them back, once each', async () => {
  const mailboxDir = mkdtempSync(join(tmpdir(), 'down-record-'))
  const id = 'f'.repeat(32)
  const route = fakeMailRoute([{ id, from: 'wren', text: okLine('wren') }])
  const delivered = []
  const one = await deliverOnce({
    fetch: route.fetch, base: 'https://board.example', slug: 'tm', key: 'k', to: 'pia', mailboxDir,
    mail: { id, from: 'wren', text: okLine('wren') }, deliver: line => delivered.push(line)
  })
  assert.equal(one.delivered, true)
  assert.equal(delivered[0], `from wren: ${okLine('wren')}`)
  const path = join(mailboxDir, 'pia', 'seen', id)
  const record = JSON.parse(readFileSync(path, 'utf8'))
  assert.equal(record.id, id)
  assert.equal(record.from, 'wren')
  assert.equal(record.text, okLine('wren'))
  assert.equal(statSync(path).mode & 0o777, 0o600, 'the record holds the text, so it is owner-only')

  const checked = new Set()
  assert.equal(deliveredToPia(mailboxDir, checked).length, 1)
  assert.equal(deliveredToPia(mailboxDir, checked).length, 0, 'a later poll reads only what is new')
  assert.equal(deliveredToPia(mailboxDir).length, 1, 'a fresh reader still sees the record')
})

test('a timestamp-only seen record (the old form) carries no text, so it never confirms', async () => {
  const mailboxDir = mkdtempSync(join(tmpdir(), 'down-old-'))
  mkdirSync(join(mailboxDir, 'pia', 'seen'), { recursive: true })
  writeFileSync(join(mailboxDir, 'pia', 'seen', 'e'.repeat(32)), `${new Date().toISOString()}\n`)
  assert.deepEqual(deliveredToPia(mailboxDir), [])
  assert.equal(await waitForConfirmation({ mailboxDir, person: 'wren', requestId: REQ, timeoutMs: 0, now: () => 0, sleep: async () => {} }), false)
})

test('crew down is routed from crew.mjs and wants CREW_HOME', () => {
  const env = { ...process.env }
  delete env.CREW_HOME
  const run = spawnSync(process.execPath, [join(HERE, 'crew.mjs'), 'down'], { encoding: 'utf8', env })
  assert.equal(run.status, 2)
  assert.match(run.stderr, /CREW_HOME is not set/)
})

function fakeRunner(log, failing = []) {
  return (command) => {
    log.push(command)
    return failing.includes(command) ? { ok: false, status: 1, stderr: 'boom' } : { ok: true, status: 0, stderr: '' }
  }
}

const parts = [
  { name: 'dev database', stop: 'stop-db' },
  { name: 'dev copy', stop: 'stop-copy' },
  { name: 'Pia', person: 'pia', stop: 'stop-pia' }
]

test('a part stops only after its person confirms with the same request id; no-person parts stop directly', async () => {
  const asked = []
  const commands = []
  const result = await downParts(parts, {
    ask: async (person, id, text) => asked.push({ person, id, text }),
    waitFor: async (person, id) => person === 'pia' && id === asked[0]?.id,
    runner: fakeRunner(commands),
    newId: () => 'req-1'
  })
  assert.equal(result.ok, true)
  assert.deepEqual(commands, ['stop-pia', 'stop-copy', 'stop-db'], 'reverse order: Pia, then the copy, then the database')
  assert.equal(asked[0].id, 'req-1')
  assert.match(asked[0].text, /crew down request req-1 for pia/)
  assert.deepEqual(result.lines, ['Pia: stopped', 'dev copy: stopped', 'dev database: stopped'])
})

test('a person who does not confirm by the timeout leaves the part running, and crew down reports it', async () => {
  const commands = []
  const result = await downParts(parts, { ask: async () => {}, waitFor: async () => false, runner: fakeRunner(commands), newId: () => 'req-2' })
  assert.equal(result.ok, false)
  assert.ok(!commands.includes('stop-pia'), 'Pia is not stopped without her confirmation')
  assert.match(result.lines[0], /^Pia: not confirmed by pia within the timeout; left running/)
})

test('--force stops an unconfirmed part and says so', async () => {
  const commands = []
  const result = await downParts(parts, { ask: async () => {}, waitFor: async () => false, runner: fakeRunner(commands), force: true, newId: () => 'req-3' })
  assert.ok(commands.includes('stop-pia'))
  assert.equal(result.lines[0], 'Pia: stopped (forced, not confirmed)')
})

test('the wrap-up text names the person, the request id and the down ok line', () => {
  const text = wrapUpText('wren', 'abc')
  assert.match(text, /crew down request abc for wren/)
  assert.match(text, /crew down ok: wren; stopped; <N> unread kept; request abc; at <time>/)
})

test('a failing stop is reported on its line and the result is not ok', async () => {
  const result = await downParts([{ name: 'dev copy', stop: 'bad' }], { runner: fakeRunner([], ['bad']) })
  assert.equal(result.ok, false)
  assert.equal(result.lines[0], 'dev copy: failed to stop: boom')
})
