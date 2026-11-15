// The app's viewport asks for viewport-fit=cover (card mwc4jp06c11oh0yz2hb, Boss ruling): without it, a notched phone
// reports every env(safe-area-inset-*) as 0 and the tab bar sits under the home indicator. The app is served without
// server rendering (ssr: false), so the page's first HTML is the one Nuxt writes from nuxt.config.ts's app.head: the
// viewport must be set there, not only in a component's useHead (which runs in the browser, after the first paint).
// The rule is checked on the source, since a browser is not needed for it. Run:
//   node --import tsx --test tests/app-viewport.test.ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const config = readFileSync(fileURLToPath(new URL('../nuxt.config.ts', import.meta.url)), 'utf8')
const viewport = config.match(/\{\s*name:\s*'viewport',\s*content:\s*'([^']*)'\s*\}/)

test('nuxt.config sets the viewport meta in app.head, and it asks for viewport-fit=cover and keeps the device width', () => {
  assert.ok(viewport, 'nuxt.config.ts sets a viewport meta in app.head')
  const parts = viewport[1]!.split(',').map(p => p.trim())
  assert.ok(parts.includes('width=device-width'), `the viewport keeps width=device-width, has: ${viewport[1]}`)
  assert.ok(parts.includes('initial-scale=1'), `the viewport keeps initial-scale=1, has: ${viewport[1]}`)
  assert.ok(parts.includes('viewport-fit=cover'), `the viewport must ask for viewport-fit=cover, has: ${viewport[1]}`)
})
