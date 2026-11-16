// The keyboard path for the calendar (app/utils/calendarKeys.ts): with a task selected, the arrow keys move its due day, as a
// drag of the same number of days would. Left and right move a day; up and down move a week. The day arithmetic is the shared
// date rule (dateNudge.ts), not a copy in this file. Pure: no DOM. Run:
//   node --import tsx --test tests/calendar-keys.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as calendarKeys from '../app/utils/calendarKeys'
import { nudgePatch } from '../app/utils/dateNudge'

test('the arrow keys: left and right move one day, up and down move one week', () => {
  assert.equal(calendarKeys.calendarKeyDelta('ArrowLeft'), -1)
  assert.equal(calendarKeys.calendarKeyDelta('ArrowRight'), 1)
  assert.equal(calendarKeys.calendarKeyDelta('ArrowUp'), -7)
  assert.equal(calendarKeys.calendarKeyDelta('ArrowDown'), 7)
})

test('any other key moves nothing', () => {
  assert.equal(calendarKeys.calendarKeyDelta('Enter'), null)
  assert.equal(calendarKeys.calendarKeyDelta('a'), null)
  assert.equal(calendarKeys.calendarKeyDelta(''), null)
})

test('the key rule holds no day arithmetic of its own: the due day comes from the shared date rule', () => {
  assert.equal('movedDueOn' in calendarKeys, false)
  const source = readFileSync(new URL('../app/utils/calendarKeys.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /Date\.UTC/)
})

test('the shared rule moves a due day the way the keys ask, across month, year and leap-day edges', () => {
  const due = (dueOn: string, delta: number) => nudgePatch({ dueOn }, 'move', delta).dueOn
  assert.equal(due('2026-11-12', 1), '2026-11-13')
  assert.equal(due('2026-11-12', -7), '2026-11-05')
  assert.equal(due('2026-12-31', 1), '2027-01-01')
  assert.equal(due('2028-02-28', 1), '2028-02-29')
})
