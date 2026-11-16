// The groups of the projects shared with a person: each group has a key of its own (by the id of what shares it, not by
// its name), and a board with no team is named by one shared constant. Pure. Run:
//   node --import tsx --test tests/shared-groups.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { groupKey, SHARED_FALLBACK_LABEL } from '../shared/utils/sharedGroups'

test('two organisations with the same name get two keys, by their ids', () => {
  assert.notEqual(groupKey('team', 't1'), groupKey('team', 't2'))
})

test('a customer group and a guest group never share a key, even with the same id', () => {
  assert.notEqual(groupKey('customer', 'x1'), groupKey('guest', 'x1'))
})

test('the same id gives the same key every time', () => {
  assert.equal(groupKey('team', 't1'), groupKey('team', 't1'))
})

test('a board with no team is named by the one shared constant', () => {
  assert.equal(SHARED_FALLBACK_LABEL, 'Shared with you')
})
