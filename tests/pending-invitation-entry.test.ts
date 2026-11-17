// Where a person with an invitation they never accepted goes on a later sign-in: to the pending invitations, which show
// 'Accept invitation'. Only with no team, no board of their own, and not asking for a new project. Pure. Run:
//   node --import tsx --test tests/pending-invitation-entry.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { pendingInvitationEntry } from '../app/utils/pendingInvitationEntry'

test('a person with a pending invitation and nothing else is sent to the pending list', () => {
  assert.equal(pendingInvitationEntry({ asksNew: false, hasProjects: false, teamCount: 0, pendingCount: 1 }), '/pending-invitations')
})

test('no pending invitation: nothing changes', () => {
  assert.equal(pendingInvitationEntry({ asksNew: false, hasProjects: false, teamCount: 0, pendingCount: 0 }), null)
})

test('a person with a board or a team stays where they are', () => {
  assert.equal(pendingInvitationEntry({ asksNew: false, hasProjects: true, teamCount: 0, pendingCount: 1 }), null)
  assert.equal(pendingInvitationEntry({ asksNew: false, hasProjects: false, teamCount: 1, pendingCount: 1 }), null)
})

test('asking for a new project stays on the page', () => {
  assert.equal(pendingInvitationEntry({ asksNew: true, hasProjects: false, teamCount: 0, pendingCount: 1 }), null)
})
