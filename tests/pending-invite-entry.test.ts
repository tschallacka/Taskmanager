// Where a person who signed up from an invitation link, but never pressed Accept, goes on the next sign-in: back to
// that invitation, not to 'Your first project'. Only with no team, no board of their own, and not asking for a new
// project. Pure. Run:
//   node --import tsx --test tests/pending-invite-entry.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { pendingInviteEntry } from '../app/utils/pendingInviteEntry'

test('a person with a pending invitation and nothing else goes back to it', () => {
  assert.equal(pendingInviteEntry({ asksNew: false, hasProjects: false, teamCount: 0, inviteToken: 'abc' }), '/invite/abc')
})

test('no pending invitation: nothing changes', () => {
  assert.equal(pendingInviteEntry({ asksNew: false, hasProjects: false, teamCount: 0, inviteToken: null }), null)
})

test('a person with a board or a team stays where they are', () => {
  assert.equal(pendingInviteEntry({ asksNew: false, hasProjects: true, teamCount: 0, inviteToken: 'abc' }), null)
  assert.equal(pendingInviteEntry({ asksNew: false, hasProjects: false, teamCount: 1, inviteToken: 'abc' }), null)
})

test('asking for a new project stays on the page', () => {
  assert.equal(pendingInviteEntry({ asksNew: true, hasProjects: false, teamCount: 0, inviteToken: 'abc' }), null)
})

test('the token is encoded in the address', () => {
  assert.equal(pendingInviteEntry({ asksNew: false, hasProjects: false, teamCount: 0, inviteToken: 'a b' }), '/invite/a%20b')
})
