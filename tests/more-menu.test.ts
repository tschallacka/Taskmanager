// The board's view row shows the More group (Overview, Messages, Time, Files) in a menu, not as four tabs (owner's design
// page06; app/utils/projectViews.ts). Source checks on the board page: the row is built from the split, and the More menu
// carries its own label. Run: node --import tsx --test tests/more-menu.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../app/pages/projects/[id].vue', import.meta.url), 'utf8')

test('the board page splits the views with splitProjectViews, and the tab row reads the primary part only', () => {
  assert.match(page, /import \{[^}]*splitProjectViews[^}]*\} from '~\/utils\/projectViews'/)
  assert.match(page, /const projectViewSplit = computed\(\(\) => splitProjectViews\(tabViews\.value\)\)/)
  assert.match(page, /v-for="v in projectViewSplit\.primary"/)
  assert.doesNotMatch(page, /v-for="v in tabViews"/, 'the row no longer lists every view as a tab')
})

test('the More group is a menu with its own label, listing the More views', () => {
  assert.match(page, /aria-label="More project views"/)
  assert.match(page, /projectViewSplit\.more/)
})

test('a More view opens its page the same way a tab does (setView, the view query)', () => {
  assert.match(page, /onSelect: \(\) => setView\(v\.key\)/)
})
