// The wake sender's light parts, with fakes (no real session, no real typing). Run: node --test crew/wake.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { logCut, sessionReady, waitForIdle, recordWake, wakeOnce, bossMailText, LOG_CUT, FAILURES_TO_MAIL_BOSS } from './wake.mjs'

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
  assert.equal(out.wake.failures, 1)
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
      record, list: [entry('working')], text: 'z', cardId: 'mw8b8is1txcwmtwp7c', key: 'wren', type: async () => {},
      readList: () => [entry('working')], now: c.now, sleep: c.sleep, timeoutMs: 1000, pollMs: 500
    })
    if (out.mailBoss) mails.push(out.mailBoss)
    record = { ...record, wake: out.wake }
  }
  assert.equal(mails.length, 1, 'Boss gets one mail for the streak')
  assert.match(mails[0], /for wren on card mw8b8is1txcwmtwp7c/)
  assert.equal(record.wake.failures, 4)
})
