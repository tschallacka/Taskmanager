// Who may withdraw or replace an open team invitation: an owner any, an admin only their own, a member none.
// Needs the Nuxt aliases because the invitation utilities import the database. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/team-invitation-rules.test.ts
import { after, test } from 'node:test'
import assert from 'node:assert/strict'

const { mayManageTeamInvitation } = await import('../server/utils/invitations')
const { db } = await import('../server/db')

after(async () => {
  await db.$client.end()
})

test('an owner may manage any open invitation, their own or another person\'s', () => {
  assert.equal(mayManageTeamInvitation('owner', 'owner-1', 'owner-1'), true)
  assert.equal(mayManageTeamInvitation('owner', 'owner-1', 'admin-1'), true)
  assert.equal(mayManageTeamInvitation('owner', 'owner-1', null), true, 'also one whose sender is gone')
})

test('an admin may manage only an invitation they sent', () => {
  assert.equal(mayManageTeamInvitation('admin', 'admin-1', 'admin-1'), true)
  assert.equal(mayManageTeamInvitation('admin', 'admin-1', 'admin-2'), false)
  assert.equal(mayManageTeamInvitation('admin', 'admin-1', 'owner-1'), false, 'an owner\'s invitation, an admin one included, is not theirs')
  assert.equal(mayManageTeamInvitation('admin', 'admin-1', null), false)
})

test('a plain member manages none, even one they somehow sent', () => {
  assert.equal(mayManageTeamInvitation('member', 'member-1', 'member-1'), false)
  assert.equal(mayManageTeamInvitation('member', 'member-1', 'owner-1'), false)
})
