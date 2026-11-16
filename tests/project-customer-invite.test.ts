// The project's Share dialog path to a customer: pick the customer and give an email; the project is filed under the
// customer and the invitation is made in one step. The input rule is pure. Run:
//   node --import tsx --test tests/project-customer-invite.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { customerInviteInputError, customerChoiceError } from '../shared/utils/inviteEmail'

test('the customer is either picked or typed as a new name, never both and never neither', () => {
  assert.equal(customerChoiceError({ customerId: 'c1', customerName: '', email: 'ada@example.com' }), null)
  assert.equal(customerChoiceError({ customerId: '', customerName: 'Acme', email: 'ada@example.com' }), null)
  assert.equal(customerChoiceError({ customerId: '', customerName: '  ', email: 'ada@example.com' }), 'Choose the customer or type a new customer\'s name.')
  assert.equal(customerChoiceError({ customerId: 'c1', customerName: 'Acme', email: 'ada@example.com' }), 'Choose one customer, or type a new name, not both.')
  assert.equal(customerChoiceError({ customerId: '', customerName: 'Acme', email: '' }), 'Enter the email address this invitation is for.')
})

test('a customer and an email are both needed', () => {
  assert.equal(customerInviteInputError({ customerId: 'c1', email: 'ada@example.com' }), null)
  assert.equal(customerInviteInputError({ customerId: '', email: 'ada@example.com' }), 'Choose the customer this person belongs to.')
  assert.equal(customerInviteInputError({ customerId: 'c1', email: '' }), 'Enter the email address this invitation is for.')
  assert.equal(customerInviteInputError({ customerId: 'c1', email: 'ada@' }), 'Enter a valid email address.')
})
