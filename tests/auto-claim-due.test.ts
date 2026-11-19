// When the projects page accepts, by itself, the invitations tied to the signed-in verified address: once, when the page is
// ready, the teams are loaded, and there is something to accept. Pure. Run:
//   node --import tsx --test tests/auto-claim-due.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { autoClaimDue, claimableCount } from '../app/utils/pendingInvitationEntry'

test('the sign-in claim counts the customer invitations on the pending page and the team and board ones it accepts', () => {
  assert.equal(claimableCount({ invitations: [], claimable: 1 }), 1)
  assert.equal(claimableCount({ invitations: [{}], claimable: 2 }), 3)
  assert.equal(claimableCount({ invitations: [] }), 0)
  assert.equal(claimableCount(undefined), 0)
})

test('a tied invitation is accepted by itself once the page is ready and teams are loaded', () => {
  assert.equal(autoClaimDue({ ready: true, teamsPending: false, pendingCount: 1, done: false }), true)
})

test('nothing to accept, already done, not ready, or teams still loading: not due', () => {
  assert.equal(autoClaimDue({ ready: true, teamsPending: false, pendingCount: 0, done: false }), false)
  assert.equal(autoClaimDue({ ready: true, teamsPending: false, pendingCount: 1, done: true }), false)
  assert.equal(autoClaimDue({ ready: false, teamsPending: false, pendingCount: 1, done: false }), false)
  assert.equal(autoClaimDue({ ready: true, teamsPending: true, pendingCount: 1, done: false }), false)
})
