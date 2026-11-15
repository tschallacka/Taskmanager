// The timeline view's keyboard and tap paths (app/components/kanban/ProjectTimelineView.vue): a focused bar moves with the arrow
// keys (Shift changes its end, Alt its start), and each row's Move-the-bar menu gives the same four moves. Both go through one
// save (applyBarAction), and the dates are the rule in app/utils/dateNudge.ts. This file is the one source check on the view;
// the pointer drag stays. Run:
//   node --import tsx --test tests/timeline-view.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const view = readFileSync(new URL('../app/components/kanban/ProjectTimelineView.vue', import.meta.url), 'utf8')
const script = view.slice(0, view.indexOf('</script>'))
/** The body of one function in the script, from its declaration to the closing brace at the start of a line. */
const fnBody = (name: string) => script.slice(script.indexOf(`function ${name}(`), script.indexOf('\n}\n', script.indexOf(`function ${name}(`)))

test('the view imports the timeline key rule, the tap items and the shared date rule', () => {
  assert.match(view, /import \{ timelineKeyAction, timelineKeyHoldsArrow, type TimelineAction \} from '~\/utils\/timelineKeys'/)
  assert.match(view, /import \{ nudgePatch \} from '~\/utils\/dateNudge'/)
  assert.match(view, /import \{ TIMELINE_TAP_ITEMS, tapItemAction, type TimelineTapItem \} from '~\/utils\/timelineTap'/)
})

test('a focused bar moves with the keys: its keydown runs the key action', () => {
  assert.match(view, /@keydown="onBarKey\(task, \$event\)"/)
  assert.match(view, /function onBarKey\(task: DatedTask, event: KeyboardEvent\)/)
  assert.match(fnBody('onBarKey'), /const action = timelineKeyAction\(event\.key, \{ shift: event\.shiftKey, alt: event\.altKey \}\)/)
  assert.match(fnBody('onBarKey'), /await applyBarAction\(task, action\)/)
})

test('a focused bar keeps Left and Right: preventDefault runs before the key action, so Alt+Left and Alt+Right do not reach the browser', () => {
  const body = fnBody('onBarKey')
  assert.match(body, /if \(timelineKeyHoldsArrow\(event\.key\)\) event\.preventDefault\(\)/)
  assert.ok(body.indexOf('timelineKeyHoldsArrow(') < body.indexOf('timelineKeyAction('), 'the hold check comes before the action')
})

test('a Move-the-bar menu item runs the tap action, through the same save', () => {
  assert.match(view, /TIMELINE_TAP_ITEMS\.map\(/)
  assert.match(view, /onSelect: \(\) => tapBar\(task, item\.id\)/)
  assert.match(fnBody('tapBar'), /const action = tapItemAction\(id\)/)
  assert.match(fnBody('tapBar'), /await applyBarAction\(task, action\)/)
})

test('the keys and the tap menu share one save: applyBarAction holds the date rule, the update and the failure toast', () => {
  const body = fnBody('applyBarAction')
  assert.ok(body.length > 0, 'applyBarAction exists')
  assert.match(body, /const patch = nudgePatch\(task, action\.mode, action\.delta\)/)
  assert.match(body, /if \(!Object\.keys\(patch\)\.length\) return/)
  assert.match(body, /await updateTask\(task\.id, patch\)/)
  assert.match(body, /catch \(e\)/)
  assert.match(body, /toast\.add\(\{ title: errorMessage\(e, 'Could not change the dates'\)/)
  for (const name of ['tapBar', 'onBarKey']) {
    assert.doesNotMatch(fnBody(name), /nudgePatch\(|updateTask\(/, `${name} does not repeat the save`)
  }
})

test('the bar and the row say how to move them, labelled for a keyboard or a tap user', () => {
  assert.match(view, /aria-label="[^"]*Arrow keys move it a day/)
  assert.match(view, /aria-label="Move the bar"/)
})

test('the row title still opens the task, and the pointer drag and its handles stay as they were', () => {
  assert.match(view, /@click="emit\('openTask', task\.id\)"/)
  assert.match(view, /@pointerdown="onDragStart\(\$event, task, 'move'\)"/)
  assert.match(view, /data-timeline-handle="start"/)
  assert.match(view, /data-timeline-handle="end"/)
})
