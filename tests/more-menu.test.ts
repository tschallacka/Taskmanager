// The board's view row shows the More group (Overview, Messages, Time, Files, and Office on a crew's board) in a menu, not as
// a row of tabs (owner's design page06). After the merge with master (0.33.0) the row is built from primaryViews and moreItems
// on the board page. Source checks on the board page: the More menu carries its own label. Run:
//   node --import tsx --test tests/more-menu.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../app/pages/projects/[id].vue', import.meta.url), 'utf8')

test('the tab row reads the primary views only; the rest are under More', () => {
  assert.match(page, /const PRIMARY_VIEWS = \['board', 'list', 'calendar', 'timeline', 'dashboard'\]/)
  assert.match(page, /v-for="v in primaryViews"/)
  assert.match(page, /const moreViews = computed\(\(\) => tabViews\.value\.filter\(v => !PRIMARY_VIEWS\.includes\(v\.key\)\)\)/)
  assert.doesNotMatch(page, /v-for="v in tabViews"/, 'the row no longer lists every view as a tab')
})

test('the More group is a menu with its own label, listing the More views', () => {
  assert.match(page, /aria-label="More project views"/)
  assert.match(page, /:items="moreItems"/)
})

test('a More view opens its page the same way a tab does (setView, the view query)', () => {
  assert.match(page, /\(v\.key === 'office' \? openOffice\(\) : setView\(v\.key\)\)/)
})
