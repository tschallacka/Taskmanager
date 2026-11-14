// The timeline view's tap path (app/components/kanban/ProjectTimelineView.vue): each task row has a Move-the-bar menu whose
// four items (app/utils/timelineTap.ts) save the same dates the keys do. Source checks on the view; the drag stays. Run:
//   node --import tsx --test tests/timeline-tap-view.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const view = readFileSync(new URL('../app/components/kanban/ProjectTimelineView.vue', import.meta.url), 'utf8')

test('the view imports the tap items and their action', () => {
  assert.match(view, /import \{ TIMELINE_TAP_ITEMS, tapItemAction, type TimelineTapItem \} from '~\/utils\/timelineTap'/)
})

test('each row has a Move-the-bar menu, labelled for a tap or a keyboard user', () => {
  assert.match(view, /<UDropdownMenu/)
  assert.match(view, /aria-label="Move the bar"/)
  assert.match(view, /TIMELINE_TAP_ITEMS\.map\(/)
})

test('a menu item saves the dates the shared rule gives, through updateTask', () => {
  assert.match(view, /onSelect: \(\) => tapBar\(task, item\.id\)/)
  assert.match(view, /async function tapBar\(task: DatedTask, id: TimelineTapItem\['id'\]\)/)
  assert.match(view, /const patch = nudgePatch\(task, action\.mode, action\.delta\)/)
  assert.match(view, /await updateTask\(task\.id, patch\)/)
})

test('the row title still opens the task, and the bar drag stays', () => {
  assert.match(view, /@click="emit\('openTask', task\.id\)"/)
  assert.match(view, /@pointerdown="onDragStart\(\$event, task, 'move'\)"/)
})
