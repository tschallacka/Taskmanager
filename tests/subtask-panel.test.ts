// A subtask opens in the task panel like a card (card mw9pjeqbrfw0xknkz3n): its address finds it, its breadcrumb shows
// the path up to it, and each row has a control that opens it. Pure helpers, plus source checks that the pages use them.
// The repo has no component test runner. Run:
//   node --import tsx --test tests/subtask-panel.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { panelTaskById, panelTrail } from '../app/utils/subtaskPanel'

const card = { id: 'c1', title: 'Card', parentTaskId: null }
const sub = { id: 's1', title: 'Subtask', parentTaskId: 'c1' }
const deep = { id: 's2', title: 'Deep', parentTaskId: 's1' }

test('a subtask address finds the subtask, not only the cards', () => {
  assert.equal(panelTaskById('s1', [card], [sub, deep]), sub)
  assert.equal(panelTaskById('c1', [card], [sub, deep]), card)
})

test('an unknown or empty address finds nothing', () => {
  assert.equal(panelTaskById('nope', [card], [sub]), null)
  assert.equal(panelTaskById(null, [card], [sub]), null)
})

test('the trail of a subtask is its parents, then itself', () => {
  assert.deepEqual(panelTrail(deep, [card], [sub, deep]).map(t => t.id), ['c1', 's1', 's2'])
  assert.deepEqual(panelTrail(card, [card], [sub, deep]).map(t => t.id), ['c1'])
})

test('a parent that is not on the board ends the trail; a loop ends it too', () => {
  const orphan = { id: 'o1', title: 'Orphan', parentTaskId: 'gone' }
  assert.deepEqual(panelTrail(orphan, [], [orphan]).map(t => t.id), ['o1'])
  const a = { id: 'a', title: 'A', parentTaskId: 'b' }
  const b = { id: 'b', title: 'B', parentTaskId: 'a' }
  assert.ok(panelTrail(a, [], [a, b]).length <= 2)
})

test('the board page finds the open task among cards and subtasks', () => {
  const page = readFileSync(join(import.meta.dirname, '..', 'app', 'pages', 'projects', '[id].vue'), 'utf8')
  assert.match(page, /panelTaskById\(/)
})

test('each subtask row has an open control that goes to the subtask panel', () => {
  const list = readFileSync(join(import.meta.dirname, '..', 'app', 'components', 'kanban', 'SubtaskList.vue'), 'utf8')
  assert.match(list, /aria-label="Open subtask/)
  assert.match(list, /taskPanelPath\(/)
})

test('the task drawer shows the trail back to the parent', () => {
  const drawer = readFileSync(join(import.meta.dirname, '..', 'app', 'components', 'kanban', 'TaskDrawer.vue'), 'utf8')
  assert.match(drawer, /panelTrail\(/)
})
