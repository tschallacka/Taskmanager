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

test('the cell component is used by its Nuxt name, KanbanListRowMeta (a bare ListRowMeta renders as an unknown element)', () => {
  assert.match(list, /<KanbanListRowMeta\b/)
  assert.doesNotMatch(list, /<ListRowMeta\b/)
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

test('the time cell shows the minutes logged on the task and logs a typed duration in place through the task time API', () => {
  assert.match(meta, /data-list-time\b/)
  assert.match(meta, /data-list-time-input/)
  assert.match(meta, /parseDuration\(text\)/, 'the typed time reads the same way the server reads it')
  assert.match(meta, /\$fetch\(`\/api\/tasks\/\$\{props\.task\.id\}\/time`, \{ method: 'POST'/)
  assert.match(meta, /emit\('logged', props\.task\.id, minutes\)/)
  assert.match(list, /:minutes="taskMinutes\[task\.id\] \?\? 0"/)
  assert.match(list, /@logged="onLogged"/)
})

test('the board time endpoint sums each task\'s entries for the board, from everyone, all days', () => {
  const route = readFileSync(new URL('../server/api/projects/[id]/task-time.get.ts', import.meta.url), 'utf8')
  assert.match(route, /routeStaffProject\(event\)/, 'staff only')
  assert.match(route, /sum\(\$\{timeEntries\.minutes\}\)/)
  assert.match(route, /groupBy\(timeEntries\.taskId\)/)
  assert.match(route, /eq\(timeEntries\.projectId, project\.id\)/, 'the board, not a range of days')
  assert.doesNotMatch(route, /getQuery|parseRange/, 'no day range from the query')
})

test('the table has exactly one header row, on a wide screen', () => {
  assert.equal(list.match(/^\s*data-list-header$/gm)?.length, 1, 'one header row, not two')
})

test('the header and the row read the same columns: the same order and the same widths, for every choice of optional columns', async () => {
  const { metaColumns, fieldColumns, LIST_CELL_WIDTH, META_ORDER } = await import('../app/utils/listColumns')
  const all = { assignee: true, due: true, labels: true, time: true }
  // The row draws the cells in the order of its markers; the header is built from the same list, so they agree.
  const rowMarkers: Record<string, string> = { assignee: 'data-list-assign', due: 'data-list-due', labels: 'data-list-labels', time: 'data-list-time' }
  const rowOrder = META_ORDER.map(key => meta.indexOf(rowMarkers[key]!))
  assert.deepEqual(rowOrder, [...rowOrder].sort((a, b) => a - b), 'the row draws the cells in META_ORDER')
  for (let mask = 0; mask < 16; mask++) {
    const shown = { assignee: !!(mask & 1), due: !!(mask & 2), labels: !!(mask & 4), time: !!(mask & 8) }
    const header = metaColumns(shown)
    const expected = META_ORDER.filter(key => shown[key])
    assert.deepEqual(header.map(col => col.key), expected, 'the header names the shown cells in row order')
    for (const col of header) assert.equal(col.width, LIST_CELL_WIDTH[col.key], 'the header and the cell share one width')
  }
  assert.deepEqual(metaColumns(all).map(col => col.key), ['assignee', 'due', 'labels', 'time'], 'the design order: Assignee, Due, Labels, Time')
  const fields = [{ id: 'f1', name: 'Priority', type: 'select' }, { id: 'f2', name: 'Estimate', type: 'number' }]
  const withFields = fieldColumns(fields)
  assert.deepEqual(withFields.map(col => col.label), ['Priority', 'Estimate'], 'the custom field names come before the optional columns')
  assert.equal(withFields[0]!.width, 'w-28')
  assert.equal(withFields[1]!.width, 'w-20')
})

test('the assignee cell shows the person by name as well as the avatar, so a person is visible in the table', () => {
  assert.match(meta, /v-if="personById\(task\.assigneeId\)"\s+class="truncate"/)
})
