// The sidebar's label for a crew row. Under its project (nested) a crew row reads "crew: <name>": the project is
// the line above, so repeating it cut the "crew:" part off on a narrow sidebar. A crew row listed on its own (its
// project is not in the list) keeps "<project> › crew: <name>", and a board or a crew home is named as is. Pure. Run:
//   node --import tsx --test tests/sidebar-crew-label.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crewChildLabel } from '../app/utils/crewTreeRows'

const shadow = {
  id: 's1',
  name: 'scratch:wick picked-up board',
  role: 'shadow' as const,
  realBoard: { id: 'b1', name: 'scratch:wick picked-up project' },
  crew: { name: 'Exit Reizen website' }
}

test('a nested crew row reads "crew: <name>" without repeating the project name', () => {
  assert.equal(crewChildLabel(shadow, 1), 'crew: Exit Reizen website')
})

test('a crew row listed on its own keeps the project in front of it', () => {
  assert.equal(crewChildLabel(shadow, 0), 'scratch:wick picked-up project › crew: Exit Reizen website')
})

test('a board is named as it is, nested or not', () => {
  const board = { id: 'b1', name: 'Website', role: 'board' as const, realBoard: null, crew: null }
  assert.equal(crewChildLabel(board, 0), 'Website')
  assert.equal(crewChildLabel(board, 1), 'Website')
})

test('a crew home board is named as it is', () => {
  const home = { id: 'h1', name: 'Crew home', role: 'crew_home' as const, realBoard: null, crew: null }
  assert.equal(crewChildLabel(home, 0), 'Crew home')
})
