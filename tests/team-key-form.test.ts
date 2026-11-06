// The team Keys panel's edit form: what a key's row starts from, and the body a save sends. The
// PATCH route keeps only the reach the form names, so a switch from one customer to one board does
// not leave the customer behind.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { teamKeyFormOf, teamKeyFormValid, teamKeyPatchBody, teamKeyScopes } from '../app/utils/teamKeyForm'

test('a read key gets only boards:read, a key that may write gets both', () => {
  assert.deepEqual(teamKeyScopes(false), ['boards:read'])
  assert.deepEqual(teamKeyScopes(true), ['boards:read', 'boards:write'])
})

test('a whole-team key sends no customer and no board', () => {
  assert.deepEqual(
    teamKeyPatchBody({ name: ' Wren ', write: true, reach: 'team', customerId: 'c1', projectId: 'p1' }),
    { name: 'Wren', scopes: ['boards:read', 'boards:write'], customerId: null, projectId: null }
  )
})

test('a customer key keeps only the customer id', () => {
  assert.deepEqual(
    teamKeyPatchBody({ name: 'Acme', write: false, reach: 'customer', customerId: 'c1', projectId: 'p1' }),
    { name: 'Acme', scopes: ['boards:read'], customerId: 'c1', projectId: null }
  )
})

test('a board key keeps only the board id', () => {
  assert.deepEqual(
    teamKeyPatchBody({ name: 'Board', write: true, reach: 'project', customerId: 'c1', projectId: 'p1' }),
    { name: 'Board', scopes: ['boards:read', 'boards:write'], customerId: null, projectId: 'p1' }
  )
})

test('a customer or board reach without its id is not saveable, and a blank name never is', () => {
  assert.equal(teamKeyFormValid({ name: 'x', write: false, reach: 'customer' }), false)
  assert.equal(teamKeyFormValid({ name: 'x', write: false, reach: 'project' }), false)
  assert.equal(teamKeyFormValid({ name: 'x', write: false, reach: 'team' }), true)
  assert.equal(teamKeyFormValid({ name: '   ', write: false, reach: 'team' }), false)
  assert.equal(teamKeyFormValid({ name: 'x', write: false, reach: 'customer', customerId: 'c1' }), true)
})

test('an open key starts from its own permissions and limit', () => {
  assert.deepEqual(
    teamKeyFormOf({ name: 'Wren', scopes: ['boards:read', 'boards:write'], limit: { type: 'customer', id: 'c1', name: 'Acme' } }),
    { name: 'Wren', write: true, reach: 'customer', customerId: 'c1', projectId: undefined }
  )
  assert.deepEqual(
    teamKeyFormOf({ name: 'Read', scopes: ['boards:read'], limit: { type: 'team', id: 't1', name: null } }),
    { name: 'Read', write: false, reach: 'team', customerId: undefined, projectId: undefined }
  )
})
