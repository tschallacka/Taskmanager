// The board's search text resets wherever the label filter resets, so a search typed on one board does not narrow the next.
// The composable needs Nuxt to run, so the rule is read from its source, as the other board tests do. Run:
//   node --import tsx --test tests/board-search-reset.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/composables/useProjects.ts', import.meta.url), 'utf8')

test('the search text is reset on the same line as the label filter, when the board is opened', () => {
  // The assignee filter is reset on the same run of lines: a person picked on one board does not narrow the next.
  assert.match(source, /_activeTags\.value = \[\]\n {8}_searchText\.value = ''\n {8}_assigneeFilter\.value = null\n {8}\/\/ A board is opened with its trash closed/)
})

test('the search text is reset with the label filter when the project is left', () => {
  assert.match(source, /_activeTags\.value = \[\]\n {4}_searchText\.value = ''\n {4}_assigneeFilter\.value = null\n {4}_showTrashed\.value = false/)
})

test('clearing the label filter leaves the search text alone', () => {
  assert.match(source, /function clearTagFilter\(\) \{\n {4}_activeTags\.value = \[\]\n {2}\}/)
})
