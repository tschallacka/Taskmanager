// Withdraw on a pending team invitation and on a pending board guest asks first, and a confirm does the withdrawal (Usher's
// UX finding: the row went at once, with no question and no undo). Source level: the Withdraw button opens the
// confirmation, and the confirmation's action calls the withdrawal.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const team = readFileSync(new URL('../app/components/TeamInvitesPanel.vue', import.meta.url), 'utf8')
const share = readFileSync(new URL('../app/components/BoardShare.vue', import.meta.url), 'utf8')

test('team: Withdraw asks for confirmation before it withdraws', () => {
  assert.match(team, /@click="askWithdraw\(invitation\)"/)
  assert.doesNotMatch(team, /@click="withdraw\(invitation\)"/)
  assert.match(team, /function askWithdraw\(invitation: OpenInvitation\)/)
  assert.match(team, /Withdraw this invitation\?/)
})

test('board: Withdraw asks for confirmation before it withdraws', () => {
  assert.match(share, /@click="askWithdraw\(invitation\)"/)
  assert.doesNotMatch(share, /@click="withdraw\(invitation\)"/)
  assert.match(share, /function askWithdraw\(invitation: Invitation\)/)
  assert.match(share, /Withdraw this invitation\?/)
})
