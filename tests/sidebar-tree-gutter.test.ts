// The sidebar project list's arrow gutter (logic): every top-level row reserves the same space at its left, so a project with a crew
// does not look indented; nested crew rows reserve none (they are indented by their own depth).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crewTreeRows, rowGutter } from '../app/utils/crewTreeRows'

const board = { id: 'b1', role: 'board' as const }
const crew = { id: 's1', role: 'shadow' as const, realBoard: { id: 'b1' } }
const plain = { id: 'b2', role: 'board' as const }

test('a top-level row with a crew shows the arrow, the same width as a spacer', () => {
  const [row] = crewTreeRows([board, crew], [])
  assert.equal(rowGutter(row!), 'toggle')
})

test('a top-level row without a crew reserves the same gutter with a spacer, so every project lines up', () => {
  const [row] = crewTreeRows([plain], [])
  assert.equal(rowGutter(row!), 'spacer')
})

test('a nested crew row reserves no gutter: it is indented by its depth instead', () => {
  const rows = crewTreeRows([board, crew], ['b1'])
  const nested = rows.find(row => row.depth === 1)
  assert.ok(nested, 'the crew is nested when its arrow is open')
  assert.equal(rowGutter(nested!), 'none')
})
