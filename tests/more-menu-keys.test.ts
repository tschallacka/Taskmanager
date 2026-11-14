// The keyboard path for the More menu in the board's view row (app/pages/projects/[id].vue): the trigger is a native button
// (Tab reaches it, Enter and Space open it), it says it opens a menu, and each item selects its view on Enter, the same as a
// click. The menu's arrow keys and Escape come from UDropdownMenu. Source checks. Run:
//   node --import tsx --test tests/more-menu-keys.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../app/pages/projects/[id].vue', import.meta.url), 'utf8')
const moreTrigger = page.slice(page.indexOf('aria-label="More project views"') - 400, page.indexOf('aria-label="More project views"') + 200)

test('the trigger is a native button, reachable with Tab, labelled, and says it opens a menu', () => {
  assert.match(moreTrigger, /<button/)
  assert.match(moreTrigger, /aria-label="More project views"/)
  assert.match(moreTrigger, /aria-haspopup="menu"/)
})

test('each More item selects its view on activation, the same as a click on a tab', () => {
  assert.match(page, /onSelect: \(\) => setView\(v\.key\)/)
  assert.doesNotMatch(page, /@click\.prevent="setView\(v\.key\)"/)
})

test('the menu is a UDropdownMenu, which gives the arrow keys and Escape', () => {
  assert.match(page, /<UDropdownMenu\s+v-if="moreViewItems\.length"/)
})
