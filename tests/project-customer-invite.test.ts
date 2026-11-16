// The project's Share dialog path to a customer: pick the customer and give an email; the project is filed under the
// customer and the invitation is made in one step. The input rule is pure. Run:
//   node --import tsx --test tests/project-customer-invite.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { customerInviteInputError } from '../shared/utils/inviteEmail'

test('a customer and an email are both needed', () => {
  assert.equal(customerInviteInputError({ customerId: 'c1', email: 'ada@example.com' }), null)
  assert.equal(customerInviteInputError({ customerId: '', email: 'ada@example.com' }), 'Choose the customer this person belongs to.')
  assert.equal(customerInviteInputError({ customerId: 'c1', email: '' }), 'Enter the email address this invitation is for.')
  assert.equal(customerInviteInputError({ customerId: 'c1', email: 'ada@' }), 'Enter a valid email address.')
})
