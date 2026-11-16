// The projects shared with a customer contact: the customer's own projects, plus the boards the person holds as a
// guest (a board shared by email, as an editor or a guest). Each project counts once. Pure. Run:
//   node --import tsx --test tests/shared-project-ids.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { sharedProjectIds } from '../server/utils/sharedProjectIds'

test('a customer with no guest boards: only the customer projects', () => {
  assert.deepEqual(sharedProjectIds(['c1', 'c2'], []), ['c1', 'c2'])
})

test('a contact with guest boards only: those boards', () => {
  assert.deepEqual(sharedProjectIds([], ['g1', 'g2']), ['g1', 'g2'])
})

test('both kinds: the customer projects first, then the guest boards', () => {
  assert.deepEqual(sharedProjectIds(['c1'], ['g1']), ['c1', 'g1'])
})

test('a project that is both a customer project and a guest board counts once', () => {
  assert.deepEqual(sharedProjectIds(['p1', 'p2'], ['p2', 'p3']), ['p1', 'p2', 'p3'])
})

test('nothing shared: an empty list', () => {
  assert.deepEqual(sharedProjectIds([], []), [])
})
