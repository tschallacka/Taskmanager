// The daemon's API-error check with fake transcripts (no real session). Run: node --test crew/session-errors.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sessionErrorReport, lastLineOf, transcriptOf, markMailed } from './session-errors.mjs'

const ID = 'fbd05fc0'
const FIXTURE = 'Please run /login · API Error: 403 Attention Required! | Cloudflare'
const LOGIN = 'Please run /login · API Error: 401 Unauthorized'
const LIMIT = "You've hit your 5-hour limit · resets 4:10am (Europe/Berlin)"

// A home with one recorded session, and a projects root with one folder holding its transcript.
function fixture(lines) {
  const home = mkdtempSync(join(tmpdir(), 'errs-home-'))
  mkdirSync(join(home, 'sessions'), { recursive: true })
  writeFileSync(join(home, 'sessions', 'wren.json'), JSON.stringify({ id: ID, name: 'wren', cardId: 'mw8b8is1txcwmtwp7c' }))
  const root = mkdtempSync(join(tmpdir(), 'errs-root-'))
  const folder = join(root, '-srv-agents-taskmanager-maintenance-taskmanager-wren-newboard')
  mkdirSync(folder, { recursive: true })
  const file = join(folder, `${ID}-20e1-4968-a501-19719be32608.jsonl`)
  writeFileSync(file, lines.map(l => JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: l } })).join('\n') + '\n')
  return { home, root, file }
}

// What a live tick does after each send succeeds: marks the error seen for that person.
function sendAll(out) {
  let map = out.sessionErrors
  for (const p of out.pending) map = markMailed(map, p.key, p.error)
  return map
}

test('the last line is read from the tail, and the transcript is found by the short id', () => {
  const { root, file } = fixture(['first line', 'last line here'])
  assert.equal(transcriptOf(root, ID), file)
  assert.equal(transcriptOf(root, 'nothere1'), null)
  assert.match(lastLineOf(file), /last line here/)
})

test('a 403 last line is blocked: api error, and Boss gets one mail for it', () => {
  const { home, root } = fixture(['working', FIXTURE])
  const first = sessionErrorReport({ home, root, state: {}, live: true })
  assert.ok(first.lines.some(l => /wren: blocked: api error: .*403/.test(l)))
  assert.equal(first.pending.length, 1)
  assert.match(first.pending[0].text, /session wren is blocked by an API error on card mw8b8is1txcwmtwp7c/)
  const again = sessionErrorReport({ home, root, state: { sessionErrors: sendAll(first) }, live: true })
  assert.equal(again.pending.length, 0, 'the same error does not mail Boss again once sent')
})

test('the login line and the limit line are blocked too, each mailed once', () => {
  for (const line of [LOGIN, LIMIT]) {
    const { home, root } = fixture([line])
    const out = sessionErrorReport({ home, root, state: {}, live: true })
    assert.ok(out.lines.some(l => l.includes('blocked: api error')), line)
    assert.equal(out.pending.length, 1, line)
  }
})

test('a later normal line clears the block, and a later error mails again', () => {
  const { home, root, file } = fixture([FIXTURE])
  const blocked = sessionErrorReport({ home, root, state: {}, live: true })
  assert.equal(blocked.pending.length, 1)
  const sentMap = sendAll(blocked)
  appendFileSync(file, `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'Back to work on the card.' } })}\n`)
  const cleared = sessionErrorReport({ home, root, state: { sessionErrors: sentMap }, live: true })
  assert.ok(cleared.lines.some(l => /block is cleared/.test(l)))
  assert.equal(cleared.pending.length, 0)
  assert.deepEqual(cleared.sessionErrors.wren, { seen: [] })
  appendFileSync(file, `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: FIXTURE } })}\n`)
  const again = sessionErrorReport({ home, root, state: { sessionErrors: cleared.sessionErrors }, live: true })
  assert.equal(again.pending.length, 1, 'the same error after a clear is a new mail')
})

test('a session with no transcript yet is silent, not an error', () => {
  const home = mkdtempSync(join(tmpdir(), 'errs-none-'))
  mkdirSync(join(home, 'sessions'), { recursive: true })
  writeFileSync(join(home, 'sessions', 'wren.json'), JSON.stringify({ id: ID, name: 'wren' }))
  const out = sessionErrorReport({ home, root: join(home, 'nope'), state: {}, live: true })
  assert.equal(out.pending.length, 0)
  assert.equal(out.lines.length, 0)
})

test('a dry-run tick does not mark the error seen, so the next live tick still mails it', () => {
  const { home, root } = fixture([FIXTURE])
  const dry = sessionErrorReport({ home, root, state: {}, live: false })
  assert.equal(dry.pending.length, 1, 'the dry-run tick finds the error')
  assert.deepEqual(dry.sessionErrors.wren?.seen ?? [], [], 'nothing is marked seen by a dry run')
  assert.ok(dry.lines.some(l => /would mail boss once/.test(l)), 'a dry run says it would mail')
  const live = sessionErrorReport({ home, root, state: { sessionErrors: dry.sessionErrors }, live: true })
  assert.equal(live.pending.length, 1, 'the live tick still has the mail to send')
  assert.match(live.pending[0].text, /session wren is blocked/)
})

test('a live tick marks the error seen only after the mail is sent', () => {
  const { home, root } = fixture([FIXTURE])
  const live = sessionErrorReport({ home, root, state: {}, live: true })
  assert.equal(live.pending.length, 1)
  assert.deepEqual(live.sessionErrors.wren.seen, [], 'not marked until the send succeeds')
  const after = markMailed(live.sessionErrors, 'wren', live.pending[0].error)
  assert.deepEqual(after.wren.seen, [FIXTURE], 'marked seen once it is sent')
  const next = sessionErrorReport({ home, root, state: { sessionErrors: after }, live: true })
  assert.equal(next.pending.length, 0, 'the sent error does not mail again')
})
