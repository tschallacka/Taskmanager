// The wake sender's light parts, with fakes (no real session, no real typing). Run: node --test crew/wake.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { logCut, sessionReady, waitForIdle, recordWake, wakeOnce, bossMailText, deliverBossMail, LOG_CUT, FAILURES_TO_MAIL_BOSS } from './wake.mjs'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// A fake interactive-shell MCP for session-wake.sh: every tool call answers with a result, except the tools named in
// `failOn`, which answer with an error. Calls are appended to a log so a test can see the order.
function fakeMcp(failOn = []) {
  const dir = mkdtempSync(join(tmpdir(), 'wake-mcp-'))
  const log = join(dir, 'calls.log')
  const bin = join(dir, 'mcp')
  writeFileSync(bin, `#!/usr/bin/env node
const fs = require('node:fs')
const lines = fs.readFileSync(0, 'utf8').trim().split('\\n')
const last = JSON.parse(lines[lines.length - 1])
const name = last.params && last.params.name
fs.appendFileSync(${JSON.stringify(log)}, (name || 'init') + '\\n')
const fail = ${JSON.stringify(failOn)}.includes(name)
process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result: fail ? { isError: true, content: [{ type: 'text', text: 'refused' }] } : { content: [{ type: 'text', text: 'ok' }] } }) + '\\n')
`)
  chmodSync(bin, 0o755)
  return { bin, log }
}

const ID = 'a1b2c3d4'
const entry = (state, status = 'running', id = ID) => ({ id, name: 'wren', state, status, startedAt: 1 })
const clock = () => {
  let t = 0
  return { now: () => t, sleep: async ms => { t += ms } }
}

test('the logged wake text is cut to 80 characters, on one line, never more', () => {
  const long = 'Mailbox: mail from wren: line one\n' + 'x'.repeat(300)
  assert.equal(logCut(long).length, LOG_CUT)
  assert.equal(logCut('a\n\nb'), 'a b')
  assert.equal(logCut(null), '')
})

test('only an idle session counts as ready; a missing entry is gone', () => {
  assert.equal(sessionReady(entry('idle', 'idle')), 'idle')
  assert.equal(sessionReady(entry('blocked', 'idle')), 'idle')
  assert.equal(sessionReady(entry('working', 'running')), 'busy')
  assert.equal(sessionReady(null), 'gone')
})

test('waitForIdle returns idle once the session is idle, and never before', async () => {
  const c = clock()
  const states = [[entry('working')], [entry('working')], [entry('idle', 'idle')]]
  const readList = () => states.shift() ?? [entry('idle', 'idle')]
  const got = await waitForIdle({ id: ID, readList, now: c.now, sleep: c.sleep, timeoutMs: 60000, pollMs: 1000 })
  assert.equal(got, 'idle')
  assert.equal(c.now(), 2000, 'it waited while the session was working')
})

test('waitForIdle gives up after the timeout when the session stays busy, and reports a gone or unreadable session', async () => {
  const c = clock()
  assert.equal(await waitForIdle({ id: ID, readList: () => [entry('working')], now: c.now, sleep: c.sleep, timeoutMs: 5000, pollMs: 1000 }), 'timeout')
  const d = clock()
  assert.equal(await waitForIdle({ id: ID, readList: () => [], now: d.now, sleep: d.sleep, timeoutMs: 5000, pollMs: 1000 }), 'gone')
  const e = clock()
  assert.equal(await waitForIdle({ id: ID, readList: () => null, now: e.now, sleep: e.sleep, timeoutMs: 3000, pollMs: 1000 }), 'unknown')
})

test('three failures in a row mail Boss once; a success resets the streak', () => {
  let wake = {}
  wake = recordWake(wake, false, 'busy')
  wake = recordWake(wake, false, 'busy')
  assert.equal(wake.mailBossNow, false)
  wake = recordWake(wake, false, 'busy')
  assert.equal(wake.mailBossNow, true, 'the third failure in a row asks for the mail')
  wake = { ...wake, mailedBoss: true, mailBossNow: false }
  wake = recordWake(wake, false, 'busy')
  assert.equal(wake.mailBossNow, false, 'a fourth failure does not mail Boss again')
  wake = recordWake(wake, true)
  assert.equal(wake.failures, 0)
  assert.equal(wake.mailedBoss, false, 'a working wake clears the streak, so a new streak can mail once more')
  assert.equal(FAILURES_TO_MAIL_BOSS, 3)
})

test('the Boss mail names the person, the card and the last error, cut to 80', () => {
  const text = bossMailText({ key: 'wren', cardId: 'mw8b8is1txcwmtwp7c', lastError: 'x'.repeat(200) })
  assert.match(text, /for wren on card mw8b8is1txcwmtwp7c/)
  assert.ok(text.includes('x'.repeat(LOG_CUT)))
  assert.ok(!text.includes('x'.repeat(LOG_CUT + 1)))
})

test('an idle recorded session is typed into once, by its id', async () => {
  const c = clock()
  const typed = []
  const out = await wakeOnce({
    record: { id: ID }, list: [entry('idle', 'idle')], text: 'The limit has reset. Read your card and carry on.', cardId: 'c1', key: 'wren',
    type: async call => typed.push(call), readList: () => [entry('idle', 'idle')], now: c.now, sleep: c.sleep, timeoutMs: 1000, pollMs: 100
  })
  assert.equal(out.ok, true)
  assert.deepEqual(typed, [{ id: ID, text: 'The limit has reset. Read your card and carry on.' }])
  assert.ok(out.reason.length <= LOG_CUT)
})

test('a busy session is never typed into; the failure is counted and the log stays cut', async () => {
  const c = clock()
  const typed = []
  const out = await wakeOnce({
    record: { id: ID }, list: [entry('working')], text: 'y'.repeat(300), cardId: 'c1', key: 'wren',
    type: async call => typed.push(call), readList: () => [entry('working')], now: c.now, sleep: c.sleep, timeoutMs: 2000, pollMs: 500
  })
  assert.equal(typed.length, 0, 'the pane was working, so nothing was typed')
  assert.equal(out.ok, false)
  assert.equal(out.wake.failures, 0, 'a busy timeout is a wait, not a failed wake')
  assert.ok(out.reason.length <= LOG_CUT + 60)
})

test('no recorded session, or a session that is not live, is a counted failure with no typing', async () => {
  const typed = []
  const none = await wakeOnce({ record: null, list: [], text: 't', cardId: 'c', key: 'wren', type: async c => typed.push(c), readList: () => [] })
  assert.equal(none.ok, false)
  assert.equal(none.wake.failures, 1)
  const gone = await wakeOnce({ record: { id: 'nope' }, list: [entry('idle', 'idle')], text: 't', cardId: 'c', key: 'wren', type: async c => typed.push(c), readList: () => [entry('idle', 'idle')] })
  assert.equal(gone.ok, false)
  assert.match(gone.reason, /not live/)
  assert.equal(typed.length, 0)
})

test('claude agents not answering is not counted as a failed wake', async () => {
  const out = await wakeOnce({ record: { id: ID }, list: null, text: 't', cardId: 'c', key: 'wren', type: async () => {}, readList: () => null })
  assert.equal(out.ok, false)
  assert.equal(out.wake.failures, 0)
})

test('three failed wakes in a row for one person give one Boss mail, with the card and the last error', async () => {
  const c = clock()
  let record = { id: ID, wake: {} }
  const mails = []
  for (let i = 0; i < 4; i++) {
    const out = await wakeOnce({
      record, list: [], text: 'z', cardId: 'mw8b8is1txcwmtwp7c', key: 'wren', type: async () => {},
      readList: () => [], now: c.now, sleep: c.sleep, timeoutMs: 1000, pollMs: 500
    })
    if (out.mailBoss) mails.push(out.mailBoss)
    record = { ...record, wake: out.wake }
  }
  assert.equal(mails.length, 1, 'Boss gets one mail for the streak')
  assert.match(mails[0], /for wren on card mw8b8is1txcwmtwp7c/)
  assert.equal(record.wake.failures, 4)
})

test('the Boss mail is sent through the app to boss, with the given text, when the config is there', async () => {
  const mailboxDir = mkdtempSync(join(tmpdir(), 'wake-mail-'))
  const sent = []
  const fetch = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) })
    return { ok: true, status: 200, json: async () => ({}) }
  }
  const text = bossMailText({ key: 'wren', cardId: 'mw8b8is1txcwmtwp7c', lastError: 'paste into session 1f592988 failed' })
  const creds = { base: 'https://board.example', crew: { slug: 'tm' }, people: { susy: { apiKey: 'k' } } }
  const out = await deliverBossMail({ creds, fetch, mailboxDir, text, makeId: () => 'e'.repeat(32) })
  assert.equal(out.ok, true)
  assert.equal(sent.length, 1)
  assert.match(sent[0].url, /\/api\/crew-mail\/tm$/)
  assert.equal(sent[0].body.to, 'boss')
  assert.equal(sent[0].body.text, text)
})

test('with no susy key or slug the Boss mail is written to the outbox, not dropped, and the line is loud', async () => {
  const mailboxDir = mkdtempSync(join(tmpdir(), 'wake-outbox-'))
  const text = bossMailText({ key: 'wren', cardId: 'mw8b8is1txcwmtwp7c', lastError: 'paste failed' })
  const out = await deliverBossMail({ creds: {}, mailboxDir, text, makeId: () => 'f'.repeat(32) })
  assert.equal(out.ok, false)
  assert.match(out.line, /^MAIL TO BOSS NOT SENT/)
  const files = readdirSync(join(mailboxDir, 'outbox'))
  assert.deepEqual(files, [`${'f'.repeat(32)}.json`], 'the mail is kept in the outbox')
  const row = JSON.parse(readFileSync(join(mailboxDir, 'outbox', files[0]), 'utf8'))
  assert.equal(row.to, 'boss')
  assert.equal(row.text, text)
})

test('a route that refuses the key still keeps the Boss mail in the outbox, and the line is loud', async () => {
  const mailboxDir = mkdtempSync(join(tmpdir(), 'wake-refused-'))
  const creds = { base: 'https://board.example', crew: { slug: 'tm' }, people: { susy: { apiKey: 'k' } } }
  const fetch = async () => ({ ok: false, status: 403, json: async () => ({}) })
  const out = await deliverBossMail({ creds, fetch, mailboxDir, text: 'refused mail', makeId: () => '1'.repeat(32) })
  assert.equal(out.ok, false)
  assert.match(out.line, /MAIL TO BOSS NOT SENT/)
  assert.equal(readdirSync(join(mailboxDir, 'outbox')).length, 1)
})

test('session-wake.sh exits 1 when the paste is refused, so the caller counts a failed wake', () => {
  const mcp = fakeMcp(['paste'])
  const run = spawnSync('sh', [join(HERE, 'session-wake.sh'), '1f592988', 'hello'], { encoding: 'utf8', env: { ...process.env, SESSION_WAKE_MCP: mcp.bin }, timeout: 120000 })
  assert.equal(run.status, 1)
  assert.match(run.stderr, /paste into session 1f592988 failed/)
  assert.ok(!run.stdout.includes('typed into'), 'nothing reports a typed wake')
})

test('session-wake.sh exits 0 only when every step answers without an error', () => {
  const mcp = fakeMcp([])
  const run = spawnSync('sh', [join(HERE, 'session-wake.sh'), '1f592988', 'hello'], { encoding: 'utf8', env: { ...process.env, SESSION_WAKE_MCP: mcp.bin }, timeout: 120000 })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /typed into session 1f592988/)
  const calls = readFileSync(mcp.log, 'utf8').trim().split('\n')
  assert.ok(calls.includes('paste') && calls.includes('key'), 'the paste and the Enter were sent')
})
