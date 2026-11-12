// The List view's cells edit in place. The assignee, due date and labels cells are ListRowMeta.vue, drawn as columns
// on a wide screen and folded under the title on a phone; the title edits in place in ProjectListView.vue. Checked at
// source level, as the sidebar shell tests are.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../app/components/kanban/${path}`, import.meta.url), 'utf8')
const list = read('ProjectListView.vue')
const meta = read('ListRowMeta.vue')

test('the assignee cell opens a menu of the board people, with Unassigned, and saves through updateTask', () => {
  assert.match(meta, /data-list-assign\b/, 'the assignee cell is a button the menu opens from')
  assert.match(meta, /<UDropdownMenu\s+:items="assignItems"/)
  assert.match(meta, /boardPeople\(\)\.map\(person =>/, 'the menu lists the people the board can assign')
  assert.match(meta, /\{ label: 'Unassigned'/)
  assert.match(meta, /saveCell\(\{ assigneeId: person\.id \}/)
})

test('the due cell is a date input that saves on change, and an empty date clears it', () => {
  assert.match(meta, /data-list-due\b/)
  assert.match(meta, /type="date"/)
  assert.match(meta, /@change="setDue\(\(\$event\.target as HTMLInputElement\)\.value\)"/)
  assert.match(meta, /saveCell\(\{ dueOn: value \|\| null \}/)
})

test('the labels cell edits as one comma-separated field, drops blanks and repeats, and saves through updateTask', () => {
  assert.match(meta, /data-list-labels\b/)
  assert.match(meta, /data-list-labels-input/)
  assert.match(meta, /labelDraft\.value\.split\(','\)\.map\(tag => tag\.trim\(\)\)\.filter\(Boolean\)/)
  assert.match(meta, /new Set\(/, 'repeats are dropped')
  assert.match(meta, /saveCell\(\{ tags \}/)
})

test('the title edits in place on a click; Enter or leaving the field saves, Escape keeps the old title', () => {
  assert.match(list, /data-list-title\b/)
  assert.match(list, /data-list-title-input/)
  assert.match(list, /@click\.stop="startTitle\(task\)"/)
  assert.match(list, /@keydown\.enter\.prevent="commitTitle\(task\)"/)
  assert.match(list, /@keydown\.escape="titleTaskId = null"/)
  assert.match(list, /@blur="commitTitle\(task\)"/)
  assert.match(list, /await updateTask\(task\.id, \{ title \}\)/)
})

test('a failed save says so in a toast, and the cell keeps what the server has', () => {
  assert.match(meta, /async function saveCell\(patch: [^)]*\), failed: string\)|async function saveCell\(patch: \{[^}]*\}, failed: string\)/)
  assert.match(meta, /try \{\s*await updateTask\(props\.task\.id, patch\)\s*\} catch \(e\) \{\s*toast\.add\(/)
})

test('phone: the extra cells fold under the title; wide screens show them as columns', () => {
  assert.match(list, /layout="fold"\s+class="mt-0\.5 md:hidden"/)
  assert.match(list, /layout="column"\s+class="hidden md:flex"/)
})

test('the cells stop the row click, so a tap on a cell does not open the task', () => {
  assert.match(meta, /<span\s+v-if="shown\.assignee"[\s\S]*?@click\.stop/)
  assert.match(meta, /<span\s+v-if="shown\.due"[\s\S]*?@click\.stop/)
  assert.match(meta, /<span\s+v-if="shown\.labels"[\s\S]*?@click\.stop/)
})
