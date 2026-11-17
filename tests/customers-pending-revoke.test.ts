// A pending contact in the Customers popup ('Invited, not accepted yet: <email>') has a labelled Revoke button, not only the
// icon on the link row below (Usher's UX finding). The button revokes that invitation, with the same confirmation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/components/CustomersModal.vue', import.meta.url), 'utf8')

test('the pending contact row has a labelled Revoke button', () => {
  const row = source.slice(source.indexOf('v-for="email in pendingInvitedEmails(invitations)"'), source.indexOf('v-for="email in pendingInvitedEmails(invitations)"') + 900)
  assert.match(row, /label="Revoke"/)
})

test('the pending row revokes its own invitation, through the same confirmation as the link row', () => {
  const row = source.slice(source.indexOf('v-for="email in pendingInvitedEmails(invitations)"'), source.indexOf('v-for="email in pendingInvitedEmails(invitations)"') + 900)
  assert.match(row, /confirmRevoke\(c\.id, invitations\.find\(invitation => invitation\.email === email\)!\)/)
})
