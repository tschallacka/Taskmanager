// The dashboard's keyboard and tap path (app/components/kanban/ProjectDashboardView.vue): the widget order and the hiding are
// done with buttons (Customize, Move up, Move down, Hide widget), so a keyboard user and a tap user reach them without a
// drag. The dashboard has no drag and no right-click menu of its own, so nothing needs a second path. Source checks. Run:
//   node --import tsx --test tests/dashboard-keys.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const view = readFileSync(new URL('../app/components/kanban/ProjectDashboardView.vue', import.meta.url), 'utf8')

test('the widget order and the hiding are buttons with labels, so a keyboard user and a tap user reach them', () => {
  assert.match(view, /aria-label="Move up"/)
  assert.match(view, /aria-label="Move down"/)
  assert.match(view, /aria-label="Hide widget"/)
  assert.match(view, /:label="editing \? 'Done' : 'Customize'"/)
})

test('the dashboard has no drag-only control: nothing in it is draggable or opens on a right-click alone', () => {
  assert.doesNotMatch(view, /draggable=/)
  assert.doesNotMatch(view, /@dragstart/)
  assert.doesNotMatch(view, /@contextmenu/)
})
