// The List view's cells edit in place (app/components/kanban/ProjectListView.vue): the assignee from a menu of the
// board's people, the due date from a date input. Checked at source level, as the sidebar shell tests are.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/components/kanban/ProjectListView.vue', import.meta.url), 'utf8')

test('the assignee cell opens a menu of the board people, with Unassigned, and saves through updateTask', () => {
  assert.match(source, /data-list-assign\b/, 'the assignee cell is a button the menu opens from')
  assert.match(source, /<UDropdownMenu\s+:items="assignItems\(task\.id\)"/)
  assert.match(source, /boardPeople\(\)\.map\(person =>/, 'the menu lists the people the board can assign')
  assert.match(source, /\{ label: 'Unassigned'/)
  assert.match(source, /saveCell\(taskId, \{ assigneeId: person\.id \}/)
})

test('the due cell is a date input that saves on change, and an empty date clears it', () => {
  assert.match(source, /data-list-due\b/)
  assert.match(source, /type="date"/)
  assert.match(source, /setDue\(task\.id, \(\$event\.target as HTMLInputElement\)\.value\)/)
  assert.match(source, /saveCell\(taskId, \{ dueOn: value \|\| null \}/)
})

test('a failed save says so in a toast, and the cell is not changed locally', () => {
  assert.match(source, /async function saveCell\(taskId: string, patch: \{[^}]*\}, failed: string\)/)
  assert.match(source, /try \{\s*await updateTask\(taskId, patch\)\s*\} catch \(e\) \{\s*toast\.add\(/)
})

test('the cells stop the row click, so a tap on a cell does not open the task', () => {
  assert.match(source, /class="flex w-6 shrink-0 justify-center"\s+@click\.stop/)
  assert.match(source, /class="w-28 shrink-0 text-right text-xs tabular-nums"[\s\S]*?@click\.stop/)
})
