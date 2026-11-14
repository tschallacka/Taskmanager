// The keyboard path for the calendar (app/utils/calendarKeys.ts): with a task selected, the arrow keys move its due day, as a
// drag of the same number of days would. Left and right move a day; up and down move a week. Pure: no DOM. Run:
//   node --import tsx --test tests/calendar-keys.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calendarKeyDelta, movedDueOn } from '../app/utils/calendarKeys'

test('the arrow keys: left and right move one day, up and down move one week', () => {
  assert.equal(calendarKeyDelta('ArrowLeft'), -1)
  assert.equal(calendarKeyDelta('ArrowRight'), 1)
  assert.equal(calendarKeyDelta('ArrowUp'), -7)
  assert.equal(calendarKeyDelta('ArrowDown'), 7)
})

test('any other key moves nothing', () => {
  assert.equal(calendarKeyDelta('Enter'), null)
  assert.equal(calendarKeyDelta('a'), null)
  assert.equal(calendarKeyDelta(''), null)
})

test('a task moves to the day the keys give, the same as a drag of that many days', () => {
  assert.equal(movedDueOn('2026-11-12', 1), '2026-11-13')
  assert.equal(movedDueOn('2026-11-12', -7), '2026-11-05')
  assert.equal(movedDueOn('2026-12-31', 1), '2027-01-01')
  assert.equal(movedDueOn('2028-02-28', 1), '2028-02-29')
})

test('a task with no due day has nothing to move from, so the keys give no day', () => {
  assert.equal(movedDueOn(null, 1), null)
  assert.equal(movedDueOn(undefined, -7), null)
})
