// The first paint (source level): Nuxt shows app/spa-loading-template.html before the app's JavaScript runs, so the "Opening your projects…"
// line is on screen from the first paint, not only once the app has started. The template is self-contained (inline CSS, no network).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const TEMPLATE = new URL('../app/spa-loading-template.html', import.meta.url)

test('a loading template exists for the first paint', () => {
  assert.ok(existsSync(TEMPLATE), 'app/spa-loading-template.html exists')
})

test('the first paint carries the "Opening your projects…" line and a spinner', () => {
  const html = readFileSync(TEMPLATE, 'utf8')
  assert.match(html, /Opening your projects…/)
  assert.match(html, /class="spinner"|animate-spin|@keyframes/, 'a spinner')
})

// The invitation page is client-rendered: for ~20 s on a slow load the first paint is the splash, and the invite page's own
// "Loading your invitation…" only shows after the app mounts. On an invitation link the first paint says the invitation
// is loading (card mwkbue4u4c06mbv0w1u).
test('on an invitation link the first paint says "Loading your invitation…"', () => {
  const html = readFileSync(TEMPLATE, 'utf8')
  assert.match(html, /Loading your invitation…/)
  assert.match(html, /location\.pathname[^\n]*\/invite\//, 'the line is swapped on an /invite/ address')
})

test('the template has no external resources', () => {
  const html = readFileSync(TEMPLATE, 'utf8')
  assert.doesNotMatch(html, /<link\s|<script\s+[^>]*src=|src=|@import/, 'inline only')
})

test('the template follows the colour choice the person made in the app, not only the OS setting', () => {
  const html = readFileSync(TEMPLATE, 'utf8')
  assert.match(html, /nuxt-color-mode/, 'reads the stored choice the app saves')
  assert.match(html, /classList\.add\('spa-dark'\)/, 'applies a dark class for a dark choice')
  assert.match(html, /\.spa-dark\s*\{/, 'the dark class sets the dark colours')
})
