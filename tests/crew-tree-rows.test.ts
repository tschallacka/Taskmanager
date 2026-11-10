// The board list's crew tree rows (app/utils/crewTreeRows.ts): a crew shadow is drawn under its real board only while
// that board's arrow points down, and the arrow and the nested rows always agree. Pure logic, no database:
//   node --import tsx --test tests/crew-tree-rows.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crewTreeRows, type TreeProject } from '../app/utils/crewTreeRows'

const real: TreeProject = { id: 'real-tm', role: 'real' }
const shadow: TreeProject = { id: 'shadow-tm', role: 'shadow', realBoard: { id: 'real-tm' } }
const monocode: TreeProject = { id: 'monocode', role: 'board' }
const orphan: TreeProject = { id: 'orphan-crew', role: 'shadow', realBoard: { id: 'not-listed' } }

test('a closed real board shows its arrow down-to-right (closed) and no nested row', () => {
  const rows = crewTreeRows([real, shadow, monocode], [])
  assert.deepEqual(rows.map(row => [row.project.id, row.depth, row.shadowCount, row.open]), [
    ['real-tm', 0, 1, false],
    ['monocode', 0, 0, false]
  ])
})

test('an open real board shows its crew shadow nested, and its arrow points down', () => {
  const rows = crewTreeRows([real, shadow, monocode], ['real-tm'])
  assert.deepEqual(rows.map(row => [row.project.id, row.depth, row.open]), [
    ['real-tm', 0, true],
    ['shadow-tm', 1, false],
    ['monocode', 0, false]
  ])
})

test('every nested row sits under a board whose arrow points down, and no row is drawn twice', () => {
  for (const openIds of [[], ['real-tm'], ['monocode'], ['real-tm', 'monocode']]) {
    const rows = crewTreeRows([real, shadow, monocode], openIds)
    const keys = rows.map(row => row.key)
    assert.equal(new Set(keys).size, keys.length, `keys unique for open ${openIds.join(',')}`)
    rows.forEach((row, index) => {
      if (row.depth === 1) {
        const parent = rows.slice(0, index).reverse().find(candidate => candidate.depth === 0)!
        assert.equal(parent.open, true, `nested ${row.project.id} follows an open parent`)
      }
    })
  }
})

test('a crew shadow whose real board is not in the list stays a top-level row, with no arrow', () => {
  const rows = crewTreeRows([orphan, monocode], [])
  assert.deepEqual(rows.map(row => [row.project.id, row.depth, row.shadowCount]), [
    ['orphan-crew', 0, 0],
    ['monocode', 0, 0]
  ])
})
