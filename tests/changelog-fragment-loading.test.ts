// The loading-state change has its changelog fragment (source level): one file, named by the card, whose first line is a bullet with a bold lead,
// as the fold requires (CONTRIBUTING.md, Changelog).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const FRAGMENT = new URL('../changelog.d/mwisegs935bfm3bf0sg-loading-state.md', import.meta.url)

test('the loading-state change has a changelog fragment named by its card', () => {
  assert.ok(existsSync(FRAGMENT), 'changelog.d/mwisegs935bfm3bf0sg-loading-state.md exists')
})

test('the fragment is one bullet with a bold lead sentence', () => {
  const first = readFileSync(FRAGMENT, 'utf8').split('\n').find(line => line.trim() !== '') ?? ''
  assert.match(first, /^- \*\*[^*]+\.\*\* /, 'a bullet that starts with a bold lead sentence')
})
