// The calendar's tap path (app/utils/calendarTap.ts): a task is picked up with its "Move" control, then a tap on a day puts it
// there. The two helpers are the rule: toggling the pick, and the move a tap on a day gives. Pure: no DOM. Run:
//   node --import tsx --test tests/calendar-tap.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayTapMove, togglePick } from '../app/utils/calendarTap'

const tasks = [
  { id: 't1', dueOn: '2026-11-12' },
  { id: 't2', dueOn: null }
]

test('picking a task selects it; picking it again clears the pick', () => {
  assert.equal(togglePick(null, 't1'), 't1')
  assert.equal(togglePick('t1', 't1'), null)
  assert.equal(togglePick('t1', 't2'), 't2')
})

test('a tap on a day moves the picked task to that day', () => {
  assert.deepEqual(dayTapMove('t1', '2026-11-20', tasks), { id: 't1', dueOn: '2026-11-20' })
  assert.deepEqual(dayTapMove('t2', '2026-11-03', tasks), { id: 't2', dueOn: '2026-11-03' })
})

test('no pick, the same day, or a task that is gone: a tap moves nothing', () => {
  assert.equal(dayTapMove(null, '2026-11-20', tasks), null)
  assert.equal(dayTapMove('t1', '2026-11-12', tasks), null)
  assert.equal(dayTapMove('missing', '2026-11-20', tasks), null)
})
