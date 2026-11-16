// A customer link revoked by its manager (revokedAt set) is never claimed or accepted, and the page names why it is dead.
// Pure: no database. The used and expired rules stay as they were.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { customerInvitesToClaim, customerLinkState, tiedInviteIsAcceptable } from '../server/utils/customerInviteRules'

const now = 1_000_000
const open = { id: 'open', email: 'ana@example.test', acceptedAt: null, expiresAt: now + 5000, revokedAt: null }
const revoked = { ...open, id: 'revoked', revokedAt: now - 1 }

test('a revoked link is not acceptable, even when it is tied to the address and open', () => {
  assert.equal(tiedInviteIsAcceptable(revoked, ['ana@example.test'], now), false)
  assert.equal(tiedInviteIsAcceptable(open, ['ana@example.test'], now), true)
})

test('a later sign-in does not claim a revoked link, and does claim an open one', () => {
  assert.deepEqual(customerInvitesToClaim([open, revoked], ['ana@example.test'], now), ['open'])
})

test('the state of a link: open, used, revoked or expired', () => {
  assert.equal(customerLinkState(open, now), 'open')
  assert.equal(customerLinkState(revoked, now), 'revoked')
  assert.equal(customerLinkState({ ...open, acceptedAt: now - 10 }, now), 'used')
  assert.equal(customerLinkState({ ...open, expiresAt: now - 1 }, now), 'expired')
})

test('a used link stays used even if it was later revoked', () => {
  assert.equal(customerLinkState({ ...revoked, acceptedAt: now - 10 }, now), 'used')
})
