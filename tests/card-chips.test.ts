// The chips on a board card (redesign 4/9): the order of the chips row, the labels (first two and "+N"), and the state
// chips, each shown only when it has a reason. Pure, so it runs without a browser. Run:
//   node --import tsx --test tests/card-chips.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { labelChipsOf, stateChipsOf, dueSoon } from '../app/utils/cardChips'

const now = new Date(2026, 10, 11, 12, 0, 0) // 11 November 2026, local noon

test('labels show the first two, then "+N" for the rest', () => {
  assert.deepEqual(labelChipsOf(['a', 'b', 'c', 'd']), { shown: ['a', 'b'], more: 2 })
  assert.deepEqual(labelChipsOf(['a']), { shown: ['a'], more: 0 })
  assert.deepEqual(labelChipsOf([]), { shown: [], more: 0 })
})

test('due soon is a due day within two days, today included; later and past days are not due soon', () => {
  assert.equal(dueSoon('2026-11-11', now), true, 'due today')
  assert.equal(dueSoon('2026-11-13', now), true, 'two days ahead')
  assert.equal(dueSoon('2026-11-14', now), false, 'three days ahead')
  assert.equal(dueSoon('2026-11-10', now), false, 'a past day is overdue, not due soon')
})

test('a finished task shows no state chip at all', () => {
  const chips = stateChipsOf({ done: true, overdue: true, dueSoon: true, blocked: true, blockedBy: 2, visibility: 'internal' })
  assert.deepEqual(chips, [])
})

test('state chips come in order: overdue, due soon, waits, team only or shared', () => {
  const chips = stateChipsOf({ done: false, overdue: true, dueSoon: false, blocked: true, blockedBy: 2, visibility: 'internal' })
  assert.deepEqual(chips.map(chip => chip.key), ['overdue', 'waits', 'team-only'])
})

test('overdue is red, due soon is orange, a waiting task says how many it waits for', () => {
  const overdue = stateChipsOf({ done: false, overdue: true, dueSoon: false, blocked: false, visibility: undefined })
  assert.deepEqual(overdue, [{ key: 'overdue', label: 'Overdue', tone: 'danger' }])
  const soon = stateChipsOf({ done: false, overdue: false, dueSoon: true, blocked: false, visibility: undefined })
  assert.deepEqual(soon, [{ key: 'due-soon', label: 'Due soon', tone: 'warn' }])
  const waits = stateChipsOf({ done: false, overdue: false, dueSoon: false, blocked: true, blockedBy: 3, visibility: undefined })
  assert.deepEqual(waits, [{ key: 'waits', label: 'Waits for 3', tone: 'warn' }])
  const waitsUnknown = stateChipsOf({ done: false, overdue: false, dueSoon: false, blocked: true, blockedBy: null, visibility: undefined })
  assert.deepEqual(waitsUnknown, [{ key: 'waits', label: 'Waits', tone: 'warn' }])
})

test('a team-only task says so, and a customer-visible task on a customer board says it is shared with the customer', () => {
  assert.deepEqual(stateChipsOf({ done: false, overdue: false, dueSoon: false, blocked: false, visibility: 'internal' }),
    [{ key: 'team-only', label: 'Team only', tone: 'warn' }])
  assert.deepEqual(stateChipsOf({ done: false, overdue: false, dueSoon: false, blocked: false, visibility: 'customer', customerBoard: true }),
    [{ key: 'shared', label: 'Shared with customer', tone: 'neutral' }])
})

test('a board with no customer has no shared chip: every task there is customer-visible by default, so that would be noise', () => {
  assert.deepEqual(stateChipsOf({ done: false, overdue: false, dueSoon: false, blocked: false, visibility: 'customer', customerBoard: false }), [])
})

test('no reason, no chip: a plain task has no state chips', () => {
  assert.deepEqual(stateChipsOf({ done: false, overdue: false, dueSoon: false, blocked: false, visibility: undefined }), [])
})
