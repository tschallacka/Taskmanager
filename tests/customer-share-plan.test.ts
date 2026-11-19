// Sharing ticked projects with a customer: every ticked project of the team is shared with that customer, whether or
// not it is already shared with another customer (a project can now be shared with several). Pure. Run:
//   node --import tsx --test tests/customer-share-plan.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { sharePlan } from '../shared/utils/projectFiling'

const teamProjects = ['alpha', 'beta', 'gamma', 'delta']

test('one tick: that project is shared with the customer', () => {
  assert.deepEqual(sharePlan(['alpha'], teamProjects), ['alpha'])
})

test('two ticks, one already shared with another customer: both are shared, none refused', () => {
  assert.deepEqual(sharePlan(['alpha', 'beta'], teamProjects), ['alpha', 'beta'])
})

test('three ticks: all three are shared, each once', () => {
  assert.deepEqual(sharePlan(['gamma', 'alpha', 'gamma', 'beta'], teamProjects), ['gamma', 'alpha', 'beta'])
})

test('a project that is not the team\'s is never shared', () => {
  assert.deepEqual(sharePlan(['alpha', 'other-team'], teamProjects), ['alpha'])
})
