// What the customer's panel says about its people: the contacts who logged in, and the invitations to an address that
// are not accepted yet ('Invited, not accepted yet'). 'Nobody logs in' is said only when there is neither. Pure. Run:
//   node --import tsx --test tests/contacts-panel.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { pendingInvitedEmails, showNobodyLine } from '../app/utils/contactsPanel'

test('a customer with a pending invitation to an address is not said to have nobody', () => {
  assert.equal(showNobodyLine(0, 1), false)
  assert.equal(showNobodyLine(0, 0), true)
  assert.equal(showNobodyLine(2, 0), false)
})

test('the pending addresses are the invitations that carry one; an anonymous link is not listed', () => {
  assert.deepEqual(pendingInvitedEmails([
    { email: 'inv-ana@scratch.example.test', label: null },
    { email: null, label: 'anyone' },
    { email: 'inv-ben@scratch.example.test', label: null }
  ]), ['inv-ana@scratch.example.test', 'inv-ben@scratch.example.test'])
})
