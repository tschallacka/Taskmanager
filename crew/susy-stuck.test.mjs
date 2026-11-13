// Susy's stuck and absent checks (card mw8b8is1txcwmtwp7c): a worker holding a card In progress whose agent is silent,
// or not running at all, is reported to Pia at once, not poked. Fake clock, fake rows, no files, no board.
//   node --test crew/susy-stuck.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MIN, workerLines } from './susy-activity.mjs'
import { workerPeople } from './susy-workers.mjs'
import { activityKey } from './susy-collector.mjs'

const NOW = Date.parse('2026-11-13T10:00:00Z')
const keyOf = name => ({ 'Wick Worker': 'wick', 'Wren Worker': 'wren' })[name]
const card = (id, assignee, extra = {}) => ({ id, title: `Card ${id}`, column: 'In progress', assignee, blocked: false, updatedAt: NOW - 30 * MIN, updates: [], ...extra })

test('a silent agent (no step for 15+ minutes, not listening) with a card in progress is stuck: to Pia, not a poke', () => {
  const rows = new Map([['wick', { key: 'wick', state: 'silent', mins: 20 }]])
  const people = workerPeople({ rows, cards: [card('c4', 'Wick Worker')], keyOf, now: NOW })
  assert.equal(people[0].state, 'stuck')
  const lines = workerLines(people)
  assert.equal(lines.length, 1)
  assert.match(lines[0], /^to pia: stuck: wick has c4 "Card c4" in progress, no step for 20 min; check that agent$/)
})

test('a silent agent with no card in progress is nothing: no stuck line', () => {
  const rows = new Map([['wick', { key: 'wick', state: 'silent', mins: 40 }]])
  const people = workerPeople({ rows, cards: [], keyOf, now: NOW })
  assert.equal(people[0].state, 'working')
  assert.deepEqual(workerLines(people), [])
})

test('a worker with a card in progress and no transcript in the window is absent: to Pia, start them', () => {
  const rows = new Map()
  const people = workerPeople({ rows, cards: [card('c1', 'Wren Worker')], keyOf, now: NOW })
  assert.equal(people.length, 1)
  assert.equal(people[0].state, 'absent')
  assert.deepEqual(workerLines(people), ['to pia: absent: wren is not running, start them (c1 "Card c1" in progress)'])
})

test('a worker with no transcript and no card in progress is no evidence: no line', () => {
  const people = workerPeople({ rows: new Map(), cards: [], keyOf, now: NOW })
  assert.deepEqual(people, [])
  assert.deepEqual(workerLines(people), [])
})

test('a blocked card is never stuck or absent', () => {
  const people = workerPeople({ rows: new Map(), cards: [card('c1', 'Wren Worker', { blocked: true })], keyOf, now: NOW })
  assert.deepEqual(workerLines(people), [])
})

test('the stuck and absent lines are one key each, so the minutes in them do not make a new line every tick', () => {
  assert.equal(activityKey('to pia: stuck: wick has c4 "Card c4" in progress, no step for 20 min; check that agent'), 'stuck|wick|c4')
  assert.equal(activityKey('to pia: stuck: wick has c4 "Card c4" in progress, no step for 21 min; check that agent'), 'stuck|wick|c4')
  assert.equal(activityKey('to pia: absent: wren is not running, start them (c1 "Card c1" in progress)'), 'absent|wren|c1')
})
