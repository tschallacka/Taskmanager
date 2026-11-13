// The daemon's API-error check on the last transcript line. Run: node --test crew/session-health.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blockedReason, errorMailOnce, errorMailText, BLOCKED_STATE, ERROR_CUT } from './session-health.mjs'

// The real line from Wren's session fbd05fc0 (the fixture), byte for byte as the transcript has it.
const FIXTURE = 'Please run /login · API Error: 403 Attention Required! | Cloudflare'

test('the 403 login line is blocked: api error, with the error text', () => {
  const h = blockedReason(FIXTURE)
  assert.equal(h.state, BLOCKED_STATE)
  assert.equal(h.error, FIXTURE)
})

test('the account limit line is blocked too, and a normal line is not', () => {
  assert.equal(blockedReason("You've hit your 5-hour limit · resets 4:10am (Europe/Berlin)").state, BLOCKED_STATE)
  assert.equal(blockedReason('Card mw8b8is1 is in progress; running the gates now.'), null)
  assert.equal(blockedReason(''), null)
})

test('the error text is cut to 80 characters and never carries more of the transcript', () => {
  const long = `API Error: 500 ${'x'.repeat(300)}`
  const h = blockedReason(long)
  assert.equal(h.error.length, ERROR_CUT)
})

test('Boss gets one mail per distinct error text for a session', () => {
  let seen = []
  let out = errorMailOnce(blockedReason(FIXTURE), seen)
  assert.equal(out.mail, true)
  seen = out.seen
  out = errorMailOnce(blockedReason(FIXTURE), seen)
  assert.equal(out.mail, false, 'the same error does not mail again')
  out = errorMailOnce(blockedReason('API Error: 429 Too Many Requests'), seen)
  assert.equal(out.mail, true, 'a different error is a new mail')
  assert.equal(errorMailOnce(null, seen).mail, false)
})

test('the Boss mail names the session, the card and the error text', () => {
  const text = errorMailText({ key: 'wren', cardId: 'mw8b8is1txcwmtwp7c', error: FIXTURE })
  assert.match(text, /session wren is blocked by an API error on card mw8b8is1txcwmtwp7c/)
  assert.ok(text.includes(FIXTURE))
})

test('a normal reply that quotes an error phrase mid-sentence is not blocked', () => {
  assert.equal(blockedReason('I saw "API Error: 403" in the logs, so I am checking the card.'), null)
  assert.equal(blockedReason('The worker wrote: Please run /login · API Error: 403 in its last reply, and I quoted it.'), null)
  assert.equal(blockedReason("Boss said you've hit your 5-hour limit before, so I will wait."), null)
  assert.equal(blockedReason('Card mw8b8is1 quotes the 403 line; the fix is in review.'), null)
})

test('the real error lines are still blocked, anchored at the start', () => {
  assert.equal(blockedReason('API Error: 500 Internal Server Error').state, BLOCKED_STATE)
  assert.equal(blockedReason("You've hit your 5-hour limit · resets 4:10am (Europe/Berlin)").state, BLOCKED_STATE)
})
