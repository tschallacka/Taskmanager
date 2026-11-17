// The invite form's email and project rules. An email invite needs a valid address; an anonymous link needs none. A
// customer with no project and none ticked gets a warning before the link is made. Pure. Run:
//   node --import tsx --test tests/invite-email.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emptyCustomerWarning, fileableProjectIds, inviteEmailError } from '../shared/utils/inviteEmail'

test('only the team\'s own projects can be filed under a customer, each once', () => {
  assert.deepEqual(fileableProjectIds(['p1', 'x9', 'p2', 'p1'], ['p1', 'p2', 'p3']), ['p1', 'p2'])
  assert.deepEqual(fileableProjectIds([], ['p1']), [])
})

test('an email invite takes a valid address, trimmed of spaces', () => {
  assert.equal(inviteEmailError('  ada@example.com ', true), null)
})

test('an email invite refuses a blank or malformed address', () => {
  assert.equal(inviteEmailError('', true), 'Enter the email address this invitation is for.')
  assert.equal(inviteEmailError('ada@', true), 'Enter a valid email address.')
  assert.equal(inviteEmailError('ada example.com', true), 'Enter a valid email address.')
})

test('an anonymous link needs no address, and a blank one is fine', () => {
  assert.equal(inviteEmailError('', false), null)
  assert.equal(inviteEmailError('   ', false), null)
})

test('an anonymous link with a malformed address is still refused', () => {
  assert.equal(inviteEmailError('not-an-address', false), 'Enter a valid email address.')
})

test('a customer with no project and none ticked is warned before the link is made', () => {
  assert.equal(emptyCustomerWarning({ customerProjectCount: 0, tickedCount: 0 }), 'This customer has no projects yet: they will see nothing.')
})

test('no warning when a project is ticked, or the customer already has one', () => {
  assert.equal(emptyCustomerWarning({ customerProjectCount: 0, tickedCount: 1 }), null)
  assert.equal(emptyCustomerWarning({ customerProjectCount: 2, tickedCount: 0 }), null)
})
