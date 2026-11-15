// The calendar view's keyboard and tap paths (app/components/kanban/ProjectCalendarView.vue): a task on a day is focusable and
// its arrow keys move its due day; a task has a Move control that picks it, and a tap on a day puts it there; the undated
// list has the same control. The rules are in app/utils/calendarKeys.ts, calendarTap.ts and dateNudge.ts, and their own tests
// carry the arithmetic. This file is the one source check on the view; the drag stays. Run:
//   node --import tsx --test tests/calendar-view.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const view = readFileSync(new URL('../app/components/kanban/ProjectCalendarView.vue', import.meta.url), 'utf8')
const script = view.slice(0, view.indexOf('</script>'))
const dayCell = view.slice(view.indexOf('v-for="task in tasksOn(day)'), view.indexOf('+{{ tasksOn(day).length - 4 }} more'))
const undatedBlock = view.slice(view.indexOf('v-for="task in undated"'), view.indexOf('</UPopover>'))
/** The body of one function in the script, from its declaration to the closing brace at the start of a line. */
const fnBody = (name: string) => script.slice(script.indexOf(`function ${name}(`), script.indexOf('\n}\n', script.indexOf(`function ${name}(`)))

test('the view imports the calendar key rule, the tap rule and the shared date rule', () => {
  assert.match(view, /import \{ calendarKeyDelta \} from '~\/utils\/calendarKeys'/)
  assert.match(view, /import \{ dayTapMove, togglePick \} from '~\/utils\/calendarTap'/)
  assert.match(view, /import \{ nudgePatch \} from '~\/utils\/dateNudge'/)
})

test('a task on a day moves with the arrow keys: the key handler saves the new due day through updateTask', () => {
  assert.match(dayCell, /@keydown="moveWithKeys\(task, \$event\)"/)
  assert.match(script, /async function moveWithKeys\(task: \{ id: string, dueOn\?: string \| null \}, event: KeyboardEvent\)/)
  assert.match(fnBody('moveWithKeys'), /const delta = calendarKeyDelta\(event\.key\)/)
  assert.match(fnBody('moveWithKeys'), /const patch = nudgePatch\(task, 'move', delta\)/)
  assert.match(fnBody('moveWithKeys'), /updateTask\(task\.id, \{ dueOn: patch\.dueOn \}\)/)
})

test('the task button says how to move it, so a keyboard user can find the keys', () => {
  assert.match(dayCell, /:aria-label="`\$\{task\.title\}, due \$\{task\.dueOn\}\. Arrow keys move it a day, up and down a week\.`"/)
})

test('the title button opens the task and does not bubble to the day cell, so opening a task never picks a day', () => {
  assert.match(dayCell, /@click\.stop="emit\('openTask', task\.id\)"/)
  assert.doesNotMatch(dayCell, /@click="emit\('openTask', task\.id\)"/)
})

test('every Move control names its task, so a screen reader says which task it moves', () => {
  const named = /:aria-label="`Move \$\{task\.title\} to another day`"/g
  assert.equal(view.match(named)?.length, 2, 'the day cell and the undated row')
  assert.doesNotMatch(view, /aria-label="Move to another day"/)
})

test('each task has a Move control that picks it', () => {
  assert.match(dayCell, /@click\.stop="pick\(task\.id\)"/)
  assert.match(undatedBlock, /@click\.stop="pick\(task\.id\)"/)
})

test('a tap on a day moves the picked task there through updateTask', () => {
  assert.match(view, /@click="tapDay\(day\)"/)
  assert.match(fnBody('tapDay'), /const move = dayTapMove\(pickedId\.value, format\(day, 'yyyy-MM-dd'\), tasks\.value\)/)
  assert.match(fnBody('tapDay'), /if \(!move\) return/)
  assert.match(fnBody('tapDay'), /await updateTask\(move\.id, \{ dueOn: move\.dueOn \}\)/)
})

test('the undated row still opens the task on a click, and keeps its drag', () => {
  assert.match(undatedBlock, /@click="emit\('openTask', task\.id\)"/)
  assert.match(undatedBlock, /@dragstart="dragStart\(task\.id, \$event\)"/)
})

test('the hint says a task can be picked and then placed by a tap', () => {
  assert.match(view, /Drag onto a day, or pick a task with its Move control and tap a day\./)
})

test('a failed save tells the user: every calendar save catches the error and shows a toast', () => {
  for (const name of ['dropOn', 'tapDay', 'moveWithKeys']) {
    const body = fnBody(name)
    assert.match(body, /catch \(e\)/, `${name} catches a failed save`)
    assert.match(body, /toast\.add\(\{ title: errorMessage\(e, 'Could not change the day'\)/, `${name} shows the toast`)
  }
  assert.match(script, /const toast = useToast\(\)/)
  assert.match(script, /import \{ errorMessage \} from '~\/utils\/untypedFetch'/)
})

test('the drag still works: the day cell keeps its drop and the task keeps its dragstart', () => {
  assert.match(view, /@drop\.prevent="dropOn\(day, \$event\)"/)
  assert.match(dayCell, /@dragstart="dragStart\(task\.id, \$event\)"/)
})
