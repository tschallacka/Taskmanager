// A click on a subtask row's title opens that subtask in the task panel, as a card does. The wiring lives in
// three .vue files, so this reads their source: each assertion fails when its link in the chain is cut.
//   node --import tsx --test tests/subtask-row-opens.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const subtaskList = source('app/components/kanban/SubtaskList.vue')
const taskDrawer = source('app/components/kanban/TaskDrawer.vue')
const boardPage = source('app/pages/projects/[id].vue')

test('a click on a subtask row opens that subtask, from the row and not from its title input', () => {
  assert.match(subtaskList, /'open-task': \[id: string\]/)
  assert.match(subtaskList, /<div\n\s+class="group\/sub[^"]*"\n\s+@click="onRowClick\(sub, \$event\)"/)
  assert.match(subtaskList, /function onRowClick\(sub: \{ id: string \}, event: Event\) \{\n {2}if \(\(event\.target as Element\)\.closest\('input, button'\)\) return\n {2}emit\('open-task', sub\.id\)\n\}/)
  assert.match(subtaskList, /@blur="onRowBlur\(sub, \$event\)"/)
})

test('a subtask list nested under a row passes the open up one level', () => {
  assert.match(subtaskList, /@open-task="emit\('open-task', \$event\)"/)
})

test('the task panel passes a subtask open up to the page', () => {
  assert.match(taskDrawer, /'open-task': \[id: string\]/)
  assert.match(taskDrawer, /@open-task="emit\('open-task', \$event\)"/)
})

test('the page opens the task the panel names, through the same handler as a card', () => {
  assert.match(boardPage, /<KanbanTaskDrawer[\s\S]*?@open-task="openTask\(\$event\)"/)
  assert.match(boardPage, /history\.pushState\(\{ taskPanel: true \}, '', taskAddress\(projectId\.value, taskId\)\)/)
})
