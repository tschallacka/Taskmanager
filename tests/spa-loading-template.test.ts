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

test('the change has its own changelog fragment (one change, one file)', () => {
  const fragment = new URL('../changelog.d/mwisegs935bfm3bf0sg-first-paint.md', import.meta.url)
  assert.ok(existsSync(fragment), 'changelog.d/mwisegs935bfm3bf0sg-first-paint.md exists')
  assert.match(readFileSync(fragment, 'utf8'), /^- \*\*[^*]+\.\*\* /, 'one bullet with a bold lead sentence')
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
