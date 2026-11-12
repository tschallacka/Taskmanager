// Susy's evidence collector, with fake cards, a fake session list, a fake clock and temp folders (no board, no claude).
//   node --test crew/susy-collector.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sessionFor, lastPostByPerson, mailAgeMinutes, listenerAgeMinutes, collectActivity } from './susy-collector.mjs'
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

test('the mail age and the listener age come from the files; no file is null, not a fault', () => {
  const home = mkdtempSync(join(tmpdir(), 'susy-collector-'))
  mkdirSync(join(home, 'mailbox', 'pia'), { recursive: true })
  mkdirSync(join(home, '.listen'), { recursive: true })
  assert.equal(mailAgeMinutes(home, 'pia', NOW), null)
  assert.equal(listenerAgeMinutes(home, NOW), null)
  const mail = join(home, 'mailbox', 'pia', 'one.json')
  writeFileSync(mail, '{}')
  utimesSync(mail, (NOW - 7 * MIN) / 1000, (NOW - 7 * MIN) / 1000)
  assert.equal(mailAgeMinutes(home, 'pia', NOW), 7)
  const listener = join(home, '.listen', 'pia.json')
  writeFileSync(listener, '{}')
  utimesSync(listener, (NOW - 2 * MIN) / 1000, (NOW - 2 * MIN) / 1000)
  assert.equal(listenerAgeMinutes(home, NOW), 2)
})
