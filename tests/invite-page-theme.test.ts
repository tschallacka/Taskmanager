// The invitation page is the first page a new visitor sees. Its colours must follow the theme (System by default),
// not a fixed dark palette: no hard-coded zinc or white classes in the template. Pure. Run:
//   node --import tsx --test tests/invite-page-theme.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const page = readFileSync(join(import.meta.dirname, '..', 'app', 'pages', 'invite', '[token].vue'), 'utf8')
const template = page.slice(page.indexOf('<template>'))

test('the invitation page template has no fixed dark palette classes', () => {
  assert.doesNotMatch(template, /\bzinc-\d+/)
  assert.doesNotMatch(template, /\btext-white\b/)
  assert.doesNotMatch(template, /\bbg-black\b/)
})

test('the page background and card use the theme tokens', () => {
  assert.match(template, /class="[^"]*\bbg-default\b[^"]*"/)
  assert.match(template, /class="[^"]*\bbg-elevated\b[^"]*\bborder-default\b[^"]*"/)
})
