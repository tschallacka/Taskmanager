// Which pending board invitations an account claims when it accepts a customer invitation or signs in: every open,
// unexpired board invitation sent to one of the account's addresses. Pure. Run:
//   node --import tsx --test tests/pending-invites.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { invitesToClaim } from '../server/utils/pendingInviteRules'

const now = Date.parse('2026-11-16T10:00:00Z')
const later = now + 60_000
const earlier = now - 60_000

test('an open invitation to one of the account addresses is claimed', () => {
  const rows = [{ id: 'i1', email: 'ada@example.com', status: 'open', expiresAt: later }]
  assert.deepEqual(invitesToClaim(rows, ['ada@example.com'], now), ['i1'])
})

test('an invitation to another address is not claimed', () => {
  const rows = [{ id: 'i1', email: 'other@example.com', status: 'open', expiresAt: later }]
  assert.deepEqual(invitesToClaim(rows, ['ada@example.com'], now), [])
})

test('an accepted or expired invitation is not claimed again', () => {
  const rows = [
    { id: 'used', email: 'ada@example.com', status: 'accepted', expiresAt: later },
    { id: 'old', email: 'ada@example.com', status: 'open', expiresAt: earlier }
  ]
  assert.deepEqual(invitesToClaim(rows, ['ada@example.com'], now), [])
})

test('the address match ignores case', () => {
  const rows = [{ id: 'i1', email: 'Ada@Example.com', status: 'open', expiresAt: later }]
  assert.deepEqual(invitesToClaim(rows, ['ada@example.com'], now), ['i1'])
})

test('several invitations for the account are all claimed, in the order given', () => {
  const rows = [
    { id: 'a', email: 'ada@example.com', status: 'open', expiresAt: later },
    { id: 'b', email: 'ada@example.com', status: 'open', expiresAt: later },
    { id: 'c', email: 'x@example.com', status: 'open', expiresAt: later }
  ]
  assert.deepEqual(invitesToClaim(rows, ['ada@example.com'], now), ['a', 'b'])
})
