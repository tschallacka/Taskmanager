// The date rule for a keyboard or tap move of a timeline bar (app/utils/dateNudge.ts): the same rule the pointer drag uses,
// so a bar moved by keys lands where a bar dragged the same number of days lands. Pure: no DOM, no database. Run:
//   node --import tsx --test tests/date-nudge.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nudgePatch } from '../app/utils/dateNudge'

test('move: a bar with a start and a due date moves both by the days given', () => {
  assert.deepEqual(nudgePatch({ startOn: '2026-11-10', dueOn: '2026-11-12' }, 'move', 1), { startOn: '2026-11-11', dueOn: '2026-11-13' })
  assert.deepEqual(nudgePatch({ startOn: '2026-11-10', dueOn: '2026-11-12' }, 'move', -3), { startOn: '2026-11-07', dueOn: '2026-11-09' })
})

test('move: a bar with only one date moves that date; the other is not added', () => {
  assert.deepEqual(nudgePatch({ dueOn: '2026-11-12' }, 'move', 2), { dueOn: '2026-11-14' })
  assert.deepEqual(nudgePatch({ startOn: '2026-11-10' }, 'move', -1), { startOn: '2026-11-09' })
})

test('start: the start edge moves; it stops at the due date and never passes it', () => {
  assert.deepEqual(nudgePatch({ startOn: '2026-11-10', dueOn: '2026-11-12' }, 'start', 1), { startOn: '2026-11-11' })
  assert.deepEqual(nudgePatch({ startOn: '2026-11-10', dueOn: '2026-11-12' }, 'start', 5), { startOn: '2026-11-12' })
})

test('end: the due edge moves; it stops at the start date and never passes it', () => {
  assert.deepEqual(nudgePatch({ startOn: '2026-11-10', dueOn: '2026-11-12' }, 'end', 2), { dueOn: '2026-11-14' })
  assert.deepEqual(nudgePatch({ startOn: '2026-11-10', dueOn: '2026-11-12' }, 'end', -9), { dueOn: '2026-11-10' })
})

test('a single-day task: its one date is both edges, so either edge moves it', () => {
  assert.deepEqual(nudgePatch({ dueOn: '2026-11-12' }, 'end', 1), { dueOn: '2026-11-13' })
  assert.deepEqual(nudgePatch({ dueOn: '2026-11-12' }, 'start', -1), { startOn: '2026-11-11' })
})

test('months and years roll over, and a leap day is kept', () => {
  assert.deepEqual(nudgePatch({ startOn: '2026-12-31', dueOn: '2027-01-01' }, 'move', 1), { startOn: '2027-01-01', dueOn: '2027-01-02' })
  assert.deepEqual(nudgePatch({ dueOn: '2028-02-28' }, 'end', 1), { dueOn: '2028-02-29' })
})

test('a move of zero days changes nothing', () => {
  assert.deepEqual(nudgePatch({ startOn: '2026-11-10', dueOn: '2026-11-12' }, 'move', 0), { startOn: '2026-11-10', dueOn: '2026-11-12' })
})

test('a task with no dates has nothing to move', () => {
  assert.deepEqual(nudgePatch({}, 'move', 1), {})
})
