// The keyboard path for a timeline bar (app/utils/timelineKeys.ts): with a bar focused, the arrow keys move the task one day
// (left and right), Shift+arrow changes its end, and Alt+arrow changes its start. Together with nudgePatch (dateNudge.ts) this
// gives the same dates a pointer drag of the same number of days gives. Pure: no DOM. Run:
//   node --import tsx --test tests/timeline-keys.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { timelineKeyAction } from '../app/utils/timelineKeys'
import { nudgePatch } from '../app/utils/dateNudge'

test('a plain arrow moves the whole bar one day', () => {
  assert.deepEqual(timelineKeyAction('ArrowRight', {}), { mode: 'move', delta: 1 })
  assert.deepEqual(timelineKeyAction('ArrowLeft', {}), { mode: 'move', delta: -1 })
})

test('Shift and an arrow change the end; Alt and an arrow change the start', () => {
  assert.deepEqual(timelineKeyAction('ArrowRight', { shift: true }), { mode: 'end', delta: 1 })
  assert.deepEqual(timelineKeyAction('ArrowLeft', { shift: true }), { mode: 'end', delta: -1 })
  assert.deepEqual(timelineKeyAction('ArrowRight', { alt: true }), { mode: 'start', delta: 1 })
  assert.deepEqual(timelineKeyAction('ArrowLeft', { alt: true }), { mode: 'start', delta: -1 })
})

test('up, down and every other key do nothing on a bar', () => {
  assert.equal(timelineKeyAction('ArrowUp', {}), null)
  assert.equal(timelineKeyAction('ArrowDown', { shift: true }), null)
  assert.equal(timelineKeyAction('Enter', {}), null)
})

test('a key move gives the dates a drag of the same days gives', () => {
  const bar = { startOn: '2026-11-10', dueOn: '2026-11-12' }
  const action = timelineKeyAction('ArrowRight', { shift: true })
  assert.ok(action)
  assert.deepEqual(nudgePatch(bar, action.mode, action.delta), { dueOn: '2026-11-13' })
  const move = timelineKeyAction('ArrowLeft', {})
  assert.ok(move)
  assert.deepEqual(nudgePatch(bar, move.mode, move.delta), { startOn: '2026-11-09', dueOn: '2026-11-11' })
})
