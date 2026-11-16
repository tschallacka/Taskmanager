// Filing a project under a customer never moves it silently from another customer: a project already shared with
// another customer is refused, with the message that says where to remove it first. Pure. Run:
//   node --import tsx --test tests/project-filing-guard.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { takenByOther, takenMessage } from '../shared/utils/projectFiling'

const rows = [
  { id: 'alpha', name: 'Alpha', customerId: 'ana', customerName: 'Ana' },
  { id: 'beta', name: 'Beta', customerId: null, customerName: null },
  { id: 'gamma', name: 'Gamma', customerId: 'ben', customerName: 'Ben' }
]

test('one tick, not taken: nothing is refused', () => {
  assert.deepEqual(takenByOther('ben', rows.filter(row => row.id === 'beta')), [])
})

test('two ticks, one already under another customer: that one is refused', () => {
  const picked = rows.filter(row => row.id === 'alpha' || row.id === 'beta')
  assert.deepEqual(takenByOther('ben', picked).map(row => row.name), ['Alpha'])
})

test('three ticks, one already under another customer: only that one is refused; the own one is fine', () => {
  assert.deepEqual(takenByOther('ben', rows).map(row => row.name), ['Alpha'])
})

test('a project already under this same customer is not refused', () => {
  assert.deepEqual(takenByOther('ben', rows.filter(row => row.id === 'gamma')), [])
})

test('the refusal says where the project is shared, and that it must be removed there first', () => {
  assert.equal(takenMessage(rows[0]!), 'Alpha is already shared with Ana: remove it from there first.')
})
