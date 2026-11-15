// The app's viewport asks for viewport-fit=cover (card mwc4jp06c11oh0yz2hb, Boss ruling): without it, a notched phone
// reports every env(safe-area-inset-*) as 0 and the tab bar sits under the home indicator. The rule is checked on the
// source of app/app.vue, since a browser is not needed for it. Run:
//   node --import tsx --test tests/app-viewport.test.ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const app = readFileSync(fileURLToPath(new URL('../app/app.vue', import.meta.url)), 'utf8')
const viewport = app.match(/\{\s*name:\s*'viewport',\s*content:\s*'([^']*)'\s*\}/)

test('the app viewport meta asks for viewport-fit=cover and keeps the device width', () => {
  assert.ok(viewport, 'app/app.vue sets a viewport meta in useHead')
  const parts = viewport[1]!.split(',').map(p => p.trim())
  assert.ok(parts.includes('width=device-width'), `the viewport keeps width=device-width, has: ${viewport[1]}`)
  assert.ok(parts.includes('initial-scale=1'), `the viewport keeps initial-scale=1, has: ${viewport[1]}`)
  assert.ok(parts.includes('viewport-fit=cover'), `the viewport must ask for viewport-fit=cover, has: ${viewport[1]}`)
})
