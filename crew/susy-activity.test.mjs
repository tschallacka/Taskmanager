// Susy's activity and Pia-liveness checks, with a fake clock and fake evidence (no session list, no board, no files).
//   node --test crew/susy-activity.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MIN, personState, waitingOf, workerLines, piaTriggerLines, escalationLines } from './susy-activity.mjs'

const NOW = Date.parse('2026-11-12T12:00:00.000Z')
const card = { id: 'c1', title: 'Build' }

test('a person is working with activity in the last 5 minutes, idle without, waiting under a marker, gone with no session', () => {
  assert.equal(personState({ session: 'running', lastActivityMs: NOW - 2 * MIN, now: NOW }), 'working')
  assert.equal(personState({ session: 'running', lastActivityMs: NOW - 9 * MIN, now: NOW }), 'idle')
  assert.equal(personState({ session: 'running', lastActivityMs: NOW - 9 * MIN, waiting: true, now: NOW }), 'waiting')
  assert.equal(personState({ session: 'ended', lastActivityMs: NOW, now: NOW }), 'gone')
})

test('a WAITING marker counts only while it is younger than 45 minutes', () => {
  const fresh = { body: `WAITING Pia's go since ${new Date(NOW - 20 * MIN).toISOString()}` }
  const old = { body: `WAITING Pia's go since ${new Date(NOW - 50 * MIN).toISOString()}` }
  assert.deepEqual(waitingOf(fresh, NOW), { for: 'Pia\'s go', since: NOW - 20 * MIN })
  assert.equal(waitingOf(old, NOW), null)
  assert.equal(waitingOf({ body: 'just a note' }, NOW), null)
})

test('a worker with a card who is idle for 10 minutes is poked, one line; a waiting worker is not', () => {
  const idle = { key: 'wick', card, blocked: false, state: 'idle', idleMs: 12 * MIN, lastUpdate: 'started the parser' }
  const lines = workerLines([idle])
  assert.equal(lines.length, 1)
  assert.match(lines[0], /^poke wick on c1: idle 12 min; last update: started the parser$/)
  assert.deepEqual(workerLines([{ ...idle, state: 'waiting' }]), [])
  assert.deepEqual(workerLines([{ ...idle, idleMs: 5 * MIN }]), [])
  assert.deepEqual(workerLines([{ ...idle, blocked: true }]), [])
})

test('a worker whose session is gone is needs resume, sent to Pia at once; not an idle poke', () => {
  const gone = { key: 'wren', card, blocked: false, state: 'gone', idleMs: 0, lastUpdate: 'x' }
  const lines = workerLines([gone])
  assert.equal(lines.length, 1)
  assert.match(lines[0], /^to pia: needs resume: wren has c1 "Build" in progress and is gone/)
})

test('Pia\'s dead triggers are named one by one, each with its own wake step', () => {
  const lines = piaTriggerLines({ listener: 4, roundTimer: 0, mailUnread: 0, handback: 0, unassigned: 0 })
  assert.equal(lines.length, 1)
  assert.match(lines[0], /^to pia: listener trigger silent 4 min \(over 3\): restart your listener/)
  const round = piaTriggerLines({ listener: 0, roundTimer: 25, mailUnread: 0, handback: 0, unassigned: 0 })
  assert.match(round[0], /roundTimer trigger silent 25 min \(over 20\): re-arm your round timer/)
  const mail = piaTriggerLines({ listener: 0, roundTimer: 0, mailUnread: 6, handback: 0, unassigned: 0 })
  assert.match(mail[0], /mailUnread trigger silent 6 min/)
})

test('no evidence for a trigger is not a fault: a null age is never named', () => {
  assert.deepEqual(piaTriggerLines({ listener: null, roundTimer: null, mailUnread: null, handback: null, unassigned: null }), [])
})

test('a go not given while load has been under 14 for 10 minutes escalates to Pia; a short load does not', () => {
  const lines = escalationLines({ goWaitMinutes: 15, loadUnder14Minutes: 12, verifyCards: [], questionMinutes: null })
  assert.equal(lines.length, 1)
  assert.match(lines[0], /^to pia: a go is waiting 15 min while load has been under 14 for 12 min/)
  assert.deepEqual(escalationLines({ goWaitMinutes: 15, loadUnder14Minutes: 4, verifyCards: [], questionMinutes: null }), [])
})

test('a card in Verify for 30 minutes goes to Boss; a QUESTION unanswered for 30 minutes goes to Boss', () => {
  const lines = escalationLines({ goWaitMinutes: null, loadUnder14Minutes: 0, verifyCards: [{ id: 'c2', title: 'Board', column: 'Verify CQ', minutes: 31 }, { id: 'c3', title: 'X', column: 'Verify PM', minutes: 10 }], questionMinutes: 40 })
  assert.equal(lines.length, 2)
  assert.match(lines[0], /^to boss: c2 "Board" has been in Verify CQ for 31 min/)
  assert.match(lines[1], /^to boss: a QUESTION has waited 40 min/)
})

test('recovery clears each line: the same check with the evidence back in range gives no line', () => {
  const before = piaTriggerLines({ listener: 9, roundTimer: 0, mailUnread: 0, handback: 0, unassigned: 0 })
  const after = piaTriggerLines({ listener: 1, roundTimer: 0, mailUnread: 0, handback: 0, unassigned: 0 })
  assert.equal(before.length, 1)
  assert.deepEqual(after, [])
  const idleThen = workerLines([{ key: 'wick', card, blocked: false, state: 'idle', idleMs: 12 * MIN, lastUpdate: 'x' }])
  const idleNow = workerLines([{ key: 'wick', card, blocked: false, state: 'working', idleMs: 0, lastUpdate: 'x' }])
  assert.equal(idleThen.length, 1)
  assert.deepEqual(idleNow, [])
})
