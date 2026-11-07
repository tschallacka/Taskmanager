// Susy Secretary's state: which pokes hold for a card, and how the poke markers move from round to round.
// Pure: no board, no database, no renderer. Run: node --import tsx --test tests/office-susy-state.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escalationTarget, isFinished, pokesFor, reconcile } from '../app/office/roles/susy'
import type { Marker, PokeCard, PokeUpdate } from '../app/office/roles/susy'

const MIN = 60_000
const T0 = Date.UTC(2026, 10, 7, 12, 0, 0)

function card(over: Partial<PokeCard> = {}): PokeCard {
  return {
    column: 'To do',
    assignee: null,
    tags: [],
    tagSince: {},
    enteredColumnAt: T0,
    updates: [],
    lastChangeAt: T0,
    ...over
  }
}

const update = (by: string, body: string, minutes: number): PokeUpdate => ({ by, body, at: T0 + minutes * MIN })

test('an unanswered question to Pia is poked after ten minutes, and not before', () => {
  const c = card({ updates: [update('wick', 'QUESTION: which one?', 0)] })
  assert.deepEqual(pokesFor(c, T0 + 9 * MIN), [])
  assert.deepEqual(pokesFor(c, T0 + 10 * MIN), [{ target: 'pia', reason: 'unanswered question' }])
})

test('a question Pia has answered is not poked', () => {
  const c = card({ updates: [update('wick', 'QUESTION: which one?', 0), update('pia', 'the first one', 3)] })
  assert.deepEqual(pokesFor(c, T0 + 30 * MIN), [])
})

test('a worker with the card in progress and no update for ten minutes is poked; a fresh update stops it', () => {
  const idle = card({ column: 'In progress', assignee: 'wren', enteredColumnAt: T0 })
  assert.deepEqual(pokesFor(idle, T0 + 10 * MIN), [{ target: 'wren', reason: 'worker idle' }])
  const working = card({ column: 'In progress', assignee: 'wren', enteredColumnAt: T0, updates: [update('wren', 'started', 8)] })
  assert.deepEqual(pokesFor(working, T0 + 10 * MIN), [])
})

test('a gate whose reviewer has not touched the card in fifteen minutes is poked, to the reviewer of that gate', () => {
  const gate = card({ column: 'Verify UX', enteredColumnAt: T0 })
  assert.deepEqual(pokesFor(gate, T0 + 15 * MIN), [{ target: 'usher', reason: 'gate untouched' }])
  assert.deepEqual(pokesFor(card({ column: 'Verify CQ', enteredColumnAt: T0 }), T0 + 15 * MIN), [{ target: 'nina', reason: 'gate untouched' }])
  assert.deepEqual(pokesFor(card({ column: 'Verify QA', enteredColumnAt: T0 }), T0 + 15 * MIN), [{ target: 'quincy', reason: 'gate untouched' }])
})

test('a Done card, or a cleaned one, is never poked', () => {
  const done = card({ column: 'Done', updates: [update('wick', 'QUESTION: x', 0)], tags: ['clean done'], tagSince: { 'clean done': T0 } })
  assert.equal(isFinished(done), true)
  assert.deepEqual(pokesFor(done, T0 + 60 * MIN), [])
  const cleaned = card({ tags: ['cleaned', 'clean done'], tagSince: { 'clean done': T0 } })
  assert.deepEqual(pokesFor(cleaned, T0 + 60 * MIN), [])
})

test('the cleanup flow: a ready card with no janitor, a plan no one checked, a grant Janet does not start, a done one unchecked', () => {
  const unassigned = card({ tags: ['ready to clean'], tagSince: { 'ready to clean': T0 } })
  assert.deepEqual(pokesFor(unassigned, T0 + 5 * MIN), [{ target: 'pia', reason: 'ready to clean unassigned' }])

  const plan = card({ tags: ['clean plan'], tagSince: { 'clean plan': T0 }, assignee: 'janet' })
  assert.deepEqual(pokesFor(plan, T0 + 10 * MIN), [{ target: 'pia', reason: 'clean plan unchecked' }])

  const granted = card({ tags: ['cleaning granted'], tagSince: { 'cleaning granted': T0 }, assignee: 'janet' })
  assert.deepEqual(pokesFor(granted, T0 + 5 * MIN), [{ target: 'janet', reason: 'cleaning not started' }])
  const started = card({ ...granted, updates: [update('janet', 'sweeping', 6)] })
  assert.deepEqual(pokesFor(started, T0 + 10 * MIN), [])

  const done = card({ tags: ['clean done'], tagSince: { 'clean done': T0 } })
  assert.deepEqual(pokesFor(done, T0 + 15 * MIN), [{ target: 'pia', reason: 'clean done unchecked' }])
})

test('a poke that holds and is already out is not repeated before its threshold', () => {
  const c = card({ updates: [update('wick', 'QUESTION: which one?', 0)] })
  const first = reconcile(c, [], T0 + 10 * MIN)
  assert.equal(first.send.length, 1)
  const markers: Marker[] = first.send
  const again = reconcile(c, markers, T0 + 15 * MIN)
  assert.deepEqual(again.send, [])
  assert.equal(again.keep.length, 1)
})

test('after its threshold a held poke goes out once more; then, unanswered, it goes one step up, and only once', () => {
  const c = card({ updates: [update('wick', 'QUESTION: which one?', 0)] })
  const first = reconcile(c, [], T0 + 10 * MIN).send
  const second = reconcile(c, first, T0 + 20 * MIN)
  assert.equal(second.send.length, 1)
  assert.equal(second.send[0]!.count, 2)
  const escalated = reconcile(c, second.send, T0 + 30 * MIN)
  assert.deepEqual(escalated.send.map(m => [m.target, m.reason, m.count]), [['boss', 'unanswered question', 1]])
  const markers: Marker[] = [...second.send, ...escalated.send]
  const later = reconcile(c, markers, T0 + 40 * MIN)
  assert.deepEqual(later.send, [], 'escalated once, not again')
})

test('a stale marker, one made before the card changed, is cleared and poked anew', () => {
  const stale: Marker = { target: 'pia', reason: 'unanswered question', at: T0 + 10 * MIN, count: 2 }
  const changed = card({ updates: [update('wick', 'QUESTION: which one?', 0), update('wick', 'more detail', 12)], lastChangeAt: T0 + 12 * MIN })
  const round = reconcile(changed, [stale], T0 + 30 * MIN)
  assert.deepEqual(round.send.map(m => [m.target, m.reason, m.count]), [['pia', 'unanswered question', 1]])
  assert.deepEqual(round.keep, [])
})

test('a reason that no longer holds drops its marker: nothing sent, nothing kept', () => {
  const marker: Marker = { target: 'pia', reason: 'unanswered question', at: T0 + 10 * MIN, count: 1 }
  const answered = card({ updates: [update('wick', 'QUESTION: which one?', 0), update('pia', 'the first', 11)], lastChangeAt: T0 + 11 * MIN })
  const round = reconcile(answered, [marker], T0 + 30 * MIN)
  assert.deepEqual(round.send, [])
  assert.deepEqual(round.keep, [])
})

test('escalation goes one step up: a worker to Pia, Pia to Boss', () => {
  assert.equal(escalationTarget('wren'), 'pia')
  assert.equal(escalationTarget('pia'), 'boss')
})
