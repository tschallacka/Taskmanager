// The undated list of the calendar (the "No date" popover in app/components/kanban/ProjectCalendarView.vue) gets the same tap
// path as a dated task: its row has a Move control that picks the task, and a tap on a day then schedules it. The row's own
// click still opens the task, and the drag stays. Source checks. Run:
//   node --import tsx --test tests/calendar-undated-tap.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const view = readFileSync(new URL('../app/components/kanban/ProjectCalendarView.vue', import.meta.url), 'utf8')
const undatedBlock = view.slice(view.indexOf('v-for="task in undated"'), view.indexOf('</UPopover>'))

test('the undated rows have a Move control that picks the task', () => {
  assert.match(undatedBlock, /aria-label="Move to another day"/)
  assert.match(undatedBlock, /@click\.stop="pick\(task\.id\)"/)
})

test('the undated row still opens the task on a click, and keeps its drag', () => {
  assert.match(undatedBlock, /@click="emit\('openTask', task\.id\)"/)
  assert.match(undatedBlock, /@dragstart="dragStart\(task\.id, \$event\)"/)
})

test('the hint says a task can be picked and then placed by a tap', () => {
  assert.match(view, /Drag onto a day, or pick a task with its Move control and tap a day\./)
})
