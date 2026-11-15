// The phone board swipes between columns (card mwc4jp06c11oh0yz2hb, Pat's check: design page09 "swipe for other columns").
// The rule is checked on the board's source, since a browser is not needed for it: the caption is there, the board
// listens for touch, and a swipe must be mostly sideways and long enough. Run:
//   node --import tsx --test tests/phone-swipe.test.ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const board = readFileSync(fileURLToPath(new URL('../app/components/kanban/KanbanBoard.vue', import.meta.url)), 'utf8')

test('the phone board shows the swipe caption below the column picker, and only below lg', () => {
  assert.match(board, /data-testid="phone-swipe-hint"/, 'the caption is in the board')
  assert.match(board, /‹ swipe for other columns ›/, 'the caption text is the design\'s')
  assert.match(board, /class="px-4 pb-2 text-center text-xs text-dimmed lg:hidden"/, 'the caption hides from lg up')
})

test('the board listens for touch on its column row and switches columns on a sideways swipe', () => {
  assert.match(board, /@touchstart\.passive="onPhoneTouchStart"/, 'the row listens for touchstart')
  assert.match(board, /@touchend\.passive="onPhoneTouchEnd"/, 'the row listens for touchend')
  assert.match(board, /Math\.abs\(dx\) < 60 \|\| Math\.abs\(dx\) < Math\.abs\(dy\) \* 1\.5/, 'a swipe must be at least 60 px and mostly sideways')
  assert.match(board, /window\.matchMedia\('\(min-width: 1024px\)'\)\.matches\) return/, 'the desktop ignores the swipe')
  assert.match(board, /phoneColumnId\.value = next/, 'a swipe sets the active column')
})
