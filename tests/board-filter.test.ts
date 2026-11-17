// The board's Filter: labels, one assignee (or Unassigned), and the search in this board. The
// rule lives in app/utils/boardFilter.ts, so these tests run it on plain task objects. The
// wiring in the page and the card (the assignee rows, the Compact cards switch, the card
// without its snippet and cover) is read from the source the way tests/board-page-chips.test.ts
// reads it. Run:
//   node --import tsx --test tests/board-filter.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { UNASSIGNED, isBoardFiltering, matchesBoardFilter, type BoardFilter } from '../app/utils/boardFilter'

const ROOT = process.cwd()
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8')
const page = read('app', 'pages', 'projects', '[id].vue')
const card = read('app', 'components', 'kanban', 'KanbanCard.vue')
const board = read('app', 'components', 'kanban', 'KanbanBoard.vue')
const composable = read('app', 'composables', 'useProjects.ts')

const NONE: BoardFilter = { labels: [], assigneeId: null, search: '' }
const task = (over: Partial<{ title: string, tags: string[], assigneeId: string | null }>) => ({
  title: 'Write the release notes',
  tags: [] as string[],
  assigneeId: null as string | null,
  ...over
})

test('with no filter on, every card shows and the Filter is not active', () => {
  assert.equal(isBoardFiltering(NONE), false)
  assert.equal(matchesBoardFilter(task({}), NONE), true)
  assert.equal(matchesBoardFilter(task({ assigneeId: 'u1' }), NONE), true)
})

test('a label filter keeps only the cards that carry every selected label', () => {
  const both: BoardFilter = { ...NONE, labels: ['billing', 'urgent'] }
  assert.equal(isBoardFiltering(both), true)
  assert.equal(matchesBoardFilter(task({ tags: ['billing', 'urgent'] }), both), true)
  assert.equal(matchesBoardFilter(task({ tags: ['billing'] }), both), false)
})

test('an assignee filter keeps only that person\'s cards', () => {
  const mine: BoardFilter = { ...NONE, assigneeId: 'u1' }
  assert.equal(isBoardFiltering(mine), true)
  assert.equal(matchesBoardFilter(task({ assigneeId: 'u1' }), mine), true)
  assert.equal(matchesBoardFilter(task({ assigneeId: 'u2' }), mine), false)
  assert.equal(matchesBoardFilter(task({ assigneeId: null }), mine), false)
})

test('Unassigned keeps only the cards with nobody on them', () => {
  const free: BoardFilter = { ...NONE, assigneeId: UNASSIGNED }
  assert.equal(UNASSIGNED, '')
  assert.equal(isBoardFiltering(free), true)
  assert.equal(matchesBoardFilter(task({ assigneeId: null }), free), true)
  assert.equal(matchesBoardFilter(task({ assigneeId: 'u1' }), free), false)
})

test('the assignee filter stacks with the labels and the search', () => {
  const all: BoardFilter = { labels: ['billing'], assigneeId: 'u1', search: 'release' }
  assert.equal(matchesBoardFilter(task({ tags: ['billing'], assigneeId: 'u1' }), all), true)
  assert.equal(matchesBoardFilter(task({ tags: ['billing'], assigneeId: 'u2' }), all), false)
  assert.equal(matchesBoardFilter(task({ tags: ['billing'], assigneeId: 'u1', title: 'Invoice' }), all), false)
})

test('the search ignores case and surrounding spaces; a blank search is no filter', () => {
  assert.equal(isBoardFiltering({ ...NONE, search: '   ' }), false)
  assert.equal(matchesBoardFilter(task({ title: 'Release notes' }), { ...NONE, search: '  RELEASE ' }), true)
})

test('the page wires the Filter: one assignee row per person, Unassigned, and the Compact cards switch', () => {
  assert.match(composable, /const _assigneeFilter = ref<string \| null>\(null\)/)
  assert.match(composable, /function toggleAssigneeFilter\(/)
  assert.match(composable, /const _compactCards = ref\(false\)/)
  assert.match(composable, /localStorage\.setItem\('tm-compact-cards'/)
  assert.match(page, /data-assignee-filter/)
  assert.match(page, /data-assignee-unassigned/)
  assert.match(page, /data-compact-cards/)
  assert.match(page, /Compact cards/)
})

test('the board filters with the shared rule and passes Compact cards to every card', () => {
  assert.match(composable, /import \{ isBoardFiltering, matchesBoardFilter \} from '~\/utils\/boardFilter'/)
  assert.match(composable, /matchesBoardFilter\(t, \{ labels: selected, assigneeId: _assigneeFilter\.value, search: _searchText\.value \}\)/)
  assert.match(board, /:compact="compactCards"/)
})

test('a compact card shows no snippet and no cover, and keeps the title and the labels', () => {
  assert.match(card, /compact\?: boolean/)
  assert.match(card, /v-if="cover && !trashed && !compact"/)
  assert.match(card, /v-if="snippet && !completed && !compact"/)
  assert.match(card, /\{\{ task\.title \}\}/)
})
