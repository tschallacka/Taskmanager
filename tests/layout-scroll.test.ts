// The app layout's content area scrolls down (card mwcq7y04b6o86q7pusm): a page with no scroller of its own, such as
// the help pages, must reach its last line. The rule is checked on the layout's source, since a browser is not needed
// for it. The browser check is on the card: the help page's wrapper scrolls to its end. Run:
//   node --import tsx --test tests/layout-scroll.test.ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const layout = readFileSync(fileURLToPath(new URL('../app/layouts/app.vue', import.meta.url)), 'utf8')
// The wrapper around the page slot is the one that holds <slot />.
const wrapper = layout.match(/<div class="([^"]*)">\s*<slot \/>/)

test('the content wrapper of the app layout scrolls down: overflow-y is auto, not hidden', () => {
  assert.ok(wrapper, 'the layout has a wrapper around its slot')
  const classes = wrapper[1]!.split(/\s+/)
  assert.ok(classes.includes('overflow-y-auto'), `the wrapper must allow vertical scrolling, has: ${wrapper[1]}`)
  assert.ok(!classes.includes('overflow-hidden'), 'the wrapper must not clip the page with overflow-hidden')
  assert.ok(classes.includes('overflow-x-hidden'), 'horizontal overflow stays clipped as before')
})
