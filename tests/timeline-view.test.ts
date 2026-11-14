// The timeline view's keyboard path (app/components/kanban/ProjectTimelineView.vue): a focused bar moves with the arrow keys,
// Shift changes its end and Alt its start (app/utils/timelineKeys.ts), and the dates are the same rule the drag uses
// (app/utils/dateNudge.ts). Source checks on the view; the pointer drag stays. Run:
//   node --import tsx --test tests/timeline-view.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const view = readFileSync(new URL('../app/components/kanban/ProjectTimelineView.vue', import.meta.url), 'utf8')

test('the view imports the timeline key rule and the shared date rule', () => {
  assert.match(view, /import \{ timelineKeyAction \} from '~\/utils\/timelineKeys'/)
  assert.match(view, /import \{ nudgePatch \} from '~\/utils\/dateNudge'/)
})

test('a focused bar moves with the keys: its keydown saves the dates the shared rule gives', () => {
  assert.match(view, /@keydown="onBarKey\(task, \$event\)"/)
  assert.match(view, /function onBarKey\(task: DatedTask, event: KeyboardEvent\)/)
  assert.match(view, /const action = timelineKeyAction\(event\.key, \{ shift: event\.shiftKey, alt: event\.altKey \}\)/)
  assert.match(view, /const patch = nudgePatch\(task, action\.mode, action\.delta\)/)
  assert.match(view, /await updateTask\(task\.id, patch\)/)
})

test('the bar says how to move it, so a keyboard user can find the keys', () => {
  assert.match(view, /aria-label="[^"]*Arrow keys move it a day/)
})

test('the pointer drag and its handles stay as they were', () => {
  assert.match(view, /@pointerdown="onDragStart\(\$event, task, 'move'\)"/)
  assert.match(view, /data-timeline-handle="start"/)
  assert.match(view, /data-timeline-handle="end"/)
})
