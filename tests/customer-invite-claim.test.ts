// Which customer invitations an account claims by itself: an open, unexpired link tied to one of the account's
// addresses (the owner's rule: an invitation to an account that already exists is accepted by itself). An anonymous
// link (no address) is never claimed this way. Pure. Run:
//   node --import tsx --test tests/customer-invite-claim.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { customerInvitesToClaim } from '../server/utils/customerInviteRules'

const now = Date.parse('2026-11-16T10:00:00Z')
const later = now + 60_000
const earlier = now - 60_000

test('an open link tied to one of the account addresses is claimed', () => {
  const rows = [{ id: 'c1', email: 'ada@example.com', acceptedAt: null, expiresAt: later }]
  assert.deepEqual(customerInvitesToClaim(rows, ['ada@example.com'], now), ['c1'])
})

test('an anonymous link is never claimed by an address', () => {
  const rows = [{ id: 'c1', email: null, acceptedAt: null, expiresAt: later }]
  assert.deepEqual(customerInvitesToClaim(rows, ['ada@example.com'], now), [])
})

test('a used, expired, or other-address link is left alone', () => {
  const rows = [
    { id: 'used', email: 'ada@example.com', acceptedAt: now - 1, expiresAt: later },
    { id: 'old', email: 'ada@example.com', acceptedAt: null, expiresAt: earlier },
    { id: 'other', email: 'x@example.com', acceptedAt: null, expiresAt: later }
  ]
  assert.deepEqual(customerInvitesToClaim(rows, ['ada@example.com'], now), [])
})

test('the address match ignores case', () => {
  const rows = [{ id: 'c1', email: 'Ada@Example.com', acceptedAt: null, expiresAt: later }]
  assert.deepEqual(customerInvitesToClaim(rows, ['ada@example.com'], now), ['c1'])
})
