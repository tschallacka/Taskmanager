// The calendar view's tap path (app/components/kanban/ProjectCalendarView.vue): a task has a Move control that picks it, and a
// tap on a day then puts it there (app/utils/calendarTap.ts). Source checks on the view; the drag stays. Run:
//   node --import tsx --test tests/calendar-tap-view.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const view = readFileSync(new URL('../app/components/kanban/ProjectCalendarView.vue', import.meta.url), 'utf8')

test('the view imports the tap rule', () => {
  assert.match(view, /import \{ dayTapMove, togglePick \} from '~\/utils\/calendarTap'/)
})

test('each task has a Move control that picks it, labelled for a tap or a keyboard user', () => {
  assert.match(view, /aria-label="Move to another day"/)
  assert.match(view, /@click\.stop="pick\(task\.id\)"/)
})

test('a tap on a day moves the picked task there through updateTask', () => {
  assert.match(view, /@click="tapDay\(day\)"/)
  assert.match(view, /const move = dayTapMove\(pickedId\.value, format\(day, 'yyyy-MM-dd'\), tasks\.value\)/)
  assert.match(view, /if \(!move\) return/)
  assert.match(view, /await updateTask\(move\.id, \{ dueOn: move\.dueOn \}\)/)
})

test('the drag stays as it was', () => {
  assert.match(view, /@drop\.prevent="dropOn\(day, \$event\)"/)
  assert.match(view, /@dragstart="dragStart\(task\.id, \$event\)"/)
})
