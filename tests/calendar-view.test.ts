// The calendar view's keyboard path (app/components/kanban/ProjectCalendarView.vue): a task on a day is focusable, and the
// arrow keys move its due day, the same days a drag gives (app/utils/calendarKeys.ts). Source checks on the view; the drag
// stays. Run: node --import tsx --test tests/calendar-view.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const view = readFileSync(new URL('../app/components/kanban/ProjectCalendarView.vue', import.meta.url), 'utf8')

test('the view imports the calendar key rule', () => {
  assert.match(view, /import \{[^}]*calendarKeyDelta[^}]*movedDueOn[^}]*\} from '~\/utils\/calendarKeys'/)
})

test('a task on a day moves with the arrow keys: the key handler saves the new due day through updateTask', () => {
  assert.match(view, /@keydown="moveWithKeys\(task, \$event\)"/)
  assert.match(view, /function moveWithKeys\(task: \{ id: string, dueOn\?: string \| null \}, event: KeyboardEvent\)/)
  assert.match(view, /const delta = calendarKeyDelta\(event\.key\)/)
  assert.match(view, /updateTask\(task\.id, \{ dueOn: next \}\)/)
})

test('the task button says how to move it, so a keyboard user can find the keys', () => {
  assert.match(view, /:aria-label="`\$\{task\.title\}, due \$\{task\.dueOn\}\. Arrow keys move it a day, up and down a week\.`"/)
})

test('the drag still works: the day cell keeps its drop and the task keeps its dragstart', () => {
  assert.match(view, /@drop\.prevent="dropOn\(day, \$event\)"/)
  assert.match(view, /@dragstart="dragStart\(task\.id, \$event\)"/)
})
