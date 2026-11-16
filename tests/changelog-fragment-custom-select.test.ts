// The custom-select changelog fragment (source level): it describes the finished state, every native select swapped, not a part still to do.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FRAGMENT = new URL('../changelog.d/mwibg99yyl0g7wjcyyp-custom-select.md', import.meta.url)

test('the fragment says every native select is now the app\'s own select', () => {
  const text = readFileSync(FRAGMENT, 'utf8')
  assert.doesNotMatch(text, /still to change|one card each/, 'no part is left to do in the fragment')
  assert.match(text, /every native select/i)
})

test('the fragment is one bullet with a bold lead sentence', () => {
  const first = readFileSync(FRAGMENT, 'utf8').split('\n').find(line => line.trim() !== '') ?? ''
  assert.match(first, /^- \*\*[^*]+\.\*\* /)
})
