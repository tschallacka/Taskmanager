// The archived bar on the board is amber, as the design shows it (page 01: "Archived is a single amber-tinted bar"), not
// the primary colour (Nina's CQ should, mwh05l7p8aze3rthpj6; Boss's ruling on the card). Read from the page source. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/board-archived-bar.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../app/pages/projects/[id].vue', import.meta.url), 'utf8')
const bar = page.slice(page.indexOf('data-archived-banner') - 400, page.indexOf('data-archived-banner') + 400)

test('the archived bar is tinted amber (the warning tone), border and background', () => {
  assert.match(bar, /border-warning\/40 bg-warning\/10/)
})

test('the archived icon is amber too', () => {
  assert.match(bar, /name="i-lucide-archive"\n\s+class="size-4 text-warning"/)
})

test('the archived bar is not primary', () => {
  assert.doesNotMatch(bar, /border-primary\/40 bg-primary\/10/)
})
