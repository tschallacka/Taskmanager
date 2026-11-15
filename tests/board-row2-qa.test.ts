// The three QA violations on the 3/9 board (Quincy, 14 Nov): the Filter button shows on a fresh board, it sits in row 2
// with search and New task, row 2 does not scroll them out of sight at 390 px, and the help article names them.
// Read from the sources, as the other board tests do. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/board-row2-qa.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../app/pages/projects/[id].vue', import.meta.url), 'utf8')
const help = readFileSync(new URL('../docs/basics/boards-and-columns.md', import.meta.url), 'utf8')

// The view row: from its scrolling tab list to the list's closing tag. Search, Filter and New task must come after it.
const tabsStart = page.indexOf('aria-label="Project views"')
const tabsEnd = page.indexOf('</nav>', tabsStart)

test('the Filter button is always on the board, not only after a label or a deleted task', () => {
  const filter = page.indexOf('i-lucide-filter')
  assert.ok(filter > 0, 'the Filter button is in the page')
  const popoverStart = page.lastIndexOf('<UPopover', filter)
  const opening = page.slice(popoverStart, page.indexOf('>', popoverStart))
  assert.doesNotMatch(opening, /v-if=/, 'the Filter popover has no v-if')
})

test('the Filter button sits in the view row, after the tab list', () => {
  assert.ok(tabsStart > 0 && tabsEnd > tabsStart, 'the view row is in the page')
  const filter = page.indexOf('i-lucide-filter')
  assert.ok(filter > tabsEnd, 'Filter comes after the tabs, in row 2')
})

test('search in this board and New task stay out of the scrolling tab list, so a phone shows them', () => {
  const search = page.indexOf('data-board-search')
  const newTask = page.indexOf('data-new-task')
  assert.ok(search > tabsEnd, 'the search box is after the tab list')
  assert.ok(newTask > tabsEnd, 'New task is after the tab list')
})

test('only the tab list scrolls sideways: the row around it does not', () => {
  const tabsOpening = page.slice(page.lastIndexOf('<nav', tabsStart), page.indexOf('>', tabsStart))
  assert.match(tabsOpening, /overflow-x-auto/, 'the tab list is the one scroller')
  const rowStart = page.lastIndexOf('<div', tabsStart)
  const rowOpening = page.slice(rowStart, page.indexOf('>', rowStart))
  assert.doesNotMatch(rowOpening, /overflow-x-auto/, 'the row around the tabs does not scroll')
})

test('the help article names Filter, Show deleted and search in this board', () => {
  assert.match(help, /\*\*Filter\*\*/)
  assert.match(help, /Show deleted/)
  assert.match(help, /Search this board|search in this board/i)
})
