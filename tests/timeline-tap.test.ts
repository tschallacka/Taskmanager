// The timeline's tap path (app/utils/timelineTap.ts): a menu on a task row offers the four moves as plain items a tap can
// reach: start one day earlier or later, the bar moved earlier or later, and its end one day earlier or later. Each item is
// an action the keyboard path also gives, so a tap and a key land the same dates. Pure: no DOM. Run:
//   node --import tsx --test tests/timeline-tap.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TIMELINE_TAP_ITEMS, tapItemAction } from '../app/utils/timelineTap'
import { timelineKeyAction } from '../app/utils/timelineKeys'
import { nudgePatch } from '../app/utils/dateNudge'

test('the menu offers the four moves, each with a label a tap user can read', () => {
  assert.deepEqual(TIMELINE_TAP_ITEMS.map(item => item.id), ['move-earlier', 'move-later', 'end-earlier', 'end-later'])
  for (const item of TIMELINE_TAP_ITEMS) assert.ok(item.label.length > 0)
})

test('each menu item is the same action as its key', () => {
  assert.deepEqual(tapItemAction('move-earlier'), timelineKeyAction('ArrowLeft', {}))
  assert.deepEqual(tapItemAction('move-later'), timelineKeyAction('ArrowRight', {}))
  assert.deepEqual(tapItemAction('end-earlier'), timelineKeyAction('ArrowLeft', { shift: true }))
  assert.deepEqual(tapItemAction('end-later'), timelineKeyAction('ArrowRight', { shift: true }))
})

test('a tap on a menu item saves the dates the shared rule gives', () => {
  const bar = { startOn: '2026-11-10', dueOn: '2026-11-12' }
  const action = tapItemAction('end-later')
  assert.deepEqual(nudgePatch(bar, action.mode, action.delta), { dueOn: '2026-11-13' })
  const earlier = tapItemAction('move-earlier')
  assert.deepEqual(nudgePatch(bar, earlier.mode, earlier.delta), { startOn: '2026-11-09', dueOn: '2026-11-11' })
})
