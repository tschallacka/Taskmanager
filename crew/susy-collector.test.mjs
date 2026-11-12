// Susy's evidence collector, with fake cards, a fake session list, a fake clock and temp folders (no board, no claude).
//   node --test crew/susy-collector.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sessionFor, lastPostByPerson, mailAgeMinutes, listenerRunning, listenerHeartbeat, activityKey, newActivityLines, collectActivity } from './susy-collector.mjs'
import { keyOfName } from './susy.mjs'

const MIN = 60000
const NOW = Date.parse('2026-11-12T12:00:00.000Z')
const keyOf = keyOfName({})

function wickCard(lastUpdateMinutesAgo) {
  return {
    id: 'c1', title: 'Build', column: 'In progress', assignee: 'Wick Worker', blocked: false, updatedAt: NOW - 30 * MIN,
    updates: [{ author: 'crew wick (agent)', at: new Date(NOW - lastUpdateMinutesAgo * MIN).toISOString(), body: 'started the parser' }]
  }
}

test('a session is running when its name carries the key, gone when it does not, and unknown when there is no list', () => {
  const sessions = [{ name: 'taskmanager-maintenance', pid: 1 }, { name: 'wick-worker-session', pid: 2 }]
  assert.equal(sessionFor('boss', sessions), 'running')
  assert.equal(sessionFor('wick', sessions), 'running')
  assert.equal(sessionFor('wren', sessions), 'gone')
  assert.equal(sessionFor('wren', null), null)
})

test('the last post per person comes from the author of each update', () => {
  const cards = [wickCard(12), { ...wickCard(3), id: 'c2' }]
  const last = lastPostByPerson(cards)
  assert.equal(last.get('wick'), NOW - 3 * MIN)
})

test('a worker with a card idle for 12 minutes is poked, from the cards and the session list alone', () => {
  const sessions = [{ name: 'wick-session' }]
  const result = collectActivity({ now: NOW, home: '/nowhere', cards: [wickCard(12)], sessions, load: 9, state: {}, keyOf })
  assert.ok(result.lines.includes('poke wick on c1: idle 12 min; last update: started the parser'))
})

test('a worker whose session is gone with a card in progress is needs resume to Pia', () => {
  const result = collectActivity({ now: NOW, home: '/nowhere', cards: [wickCard(12)], sessions: [], load: 9, state: {}, keyOf })
  assert.ok(result.lines.some(line => /^to pia: needs resume: wick has c1/.test(line)))
})

test('with no session list, no person is judged (no evidence is not a fault)', () => {
  const result = collectActivity({ now: NOW, home: '/nowhere', cards: [wickCard(12)], sessions: null, load: 9, state: {}, keyOf })
  assert.deepEqual(result.people, [])
  assert.equal(result.lines.filter(line => /poke|needs resume/.test(line)).length, 0)
})

test('load under 14 is tracked from the first tick it is seen; over 14 it resets', () => {
  const under = collectActivity({ now: NOW, home: '/nowhere', cards: [], sessions: [], load: 9, state: {}, keyOf })
  assert.equal(under.loadUnderSince, NOW)
  const since = NOW - 12 * MIN
  const kept = collectActivity({ now: NOW, home: '/nowhere', cards: [], sessions: [], load: 9, state: { loadUnderSince: since }, keyOf })
  assert.equal(kept.loadUnderSince, since)
  const over = collectActivity({ now: NOW, home: '/nowhere', cards: [], sessions: [], load: 20, state: { loadUnderSince: since }, keyOf })
  assert.equal(over.loadUnderSince, null)
})

test('the mail age comes from the folder; no folder is null, not a fault', () => {
  const home = mkdtempSync(join(tmpdir(), 'susy-collector-'))
  mkdirSync(join(home, 'mailbox', 'pia'), { recursive: true })
  assert.equal(mailAgeMinutes(home, 'pia', NOW), null)
  const mail = join(home, 'mailbox', 'pia', 'one.json')
  writeFileSync(mail, '{}')
  utimesSync(mail, (NOW - 7 * MIN) / 1000, (NOW - 7 * MIN) / 1000)
  assert.equal(mailAgeMinutes(home, 'pia', NOW), 7)
})

test('the listener is a sampled heartbeat, not a file: running is age 0; stopped is the minutes since last seen', () => {
  assert.equal(listenerRunning(() => ({ status: 0 })), true)
  assert.equal(listenerRunning(() => ({ status: 1 })), false)
  assert.equal(listenerRunning(() => { throw new Error('no pgrep') }), null)
  assert.deepEqual(listenerHeartbeat({ running: true, lastSeenAt: NOW - 30 * MIN, now: NOW }), { age: 0, seenAt: NOW })
  assert.deepEqual(listenerHeartbeat({ running: false, lastSeenAt: NOW - 5 * MIN, now: NOW }), { age: 5, seenAt: NOW - 5 * MIN })
  assert.deepEqual(listenerHeartbeat({ running: false, lastSeenAt: null, now: NOW }), { age: null, seenAt: null }, 'never seen is no evidence')
  assert.deepEqual(listenerHeartbeat({ running: null, lastSeenAt: NOW - 5 * MIN, now: NOW }).age, null, 'cannot be asked is no evidence')
})

test('a listener that is running is not reported silent, whatever its pia.json says; a stopped one is, after its last sighting', () => {
  const base = { now: NOW, home: '/nowhere', cards: [], sessions: [], load: 9, keyOf: () => null }
  const up = collectActivity({ ...base, listenerRunning: true, state: { listenerSeenAt: NOW - 60 * MIN } })
  assert.equal(up.ages.listener, 0)
  assert.equal(up.lines.some(line => /listener trigger/.test(line)), false)
  const down = collectActivity({ ...base, listenerRunning: false, state: { listenerSeenAt: NOW - 5 * MIN } })
  assert.equal(down.ages.listener, 5)
  assert.ok(down.lines.some(line => /listener trigger silent 5 min/.test(line)))
  assert.equal(down.listenerSeenAt, NOW - 5 * MIN)
})

test('an activity condition is logged when it starts, not on every tick it holds; a cleared one is new again when it returns', () => {
  const tick1 = newActivityLines(['to pia: listener trigger silent 4 min (over 3): restart your listener (listen.mjs pia 600)'], {})
  assert.equal(tick1.fresh.length, 1)
  const tick2 = newActivityLines(['to pia: listener trigger silent 5 min (over 3): restart your listener (listen.mjs pia 600)'], tick1.pending)
  assert.deepEqual(tick2.fresh, [], 'the same condition, with the minutes moved on, is not logged again')
  const cleared = newActivityLines([], tick2.pending)
  assert.deepEqual(cleared.pending, {}, 'a condition that clears is dropped')
  const back = newActivityLines(['to pia: listener trigger silent 4 min (over 3): restart your listener (listen.mjs pia 600)'], cleared.pending)
  assert.equal(back.fresh.length, 1, 'and logged again when it returns')
})

test('the activity keys: a poke is one key per person and card; each Pia trigger is one key', () => {
  assert.equal(activityKey('poke wick on c1: idle 12 min; last update: x'), 'poke|wick|c1')
  assert.equal(activityKey('poke wick on c1: idle 40 min; last update: y'), 'poke|wick|c1')
  assert.equal(activityKey('to pia: mailUnread trigger silent 6 min (over 5): read your mail (mailbox.mjs read pia)'), 'trigger|mailUnread')
  assert.equal(activityKey('to boss: c2 "Board" has been in Verify CQ for 31 min'), 'verify|c2')
})
