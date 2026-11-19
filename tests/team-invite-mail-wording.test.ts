// The team invite says which case it is when the mail is not sent (Usher's low finding): this instance cannot send mail,
// or sending failed. The route reports whether mail is configured, and the panel says the owner's next step for each.
// Source level.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../server/api/teams/[id]/invitations/index.post.ts', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../app/components/TeamInvitesPanel.vue', import.meta.url), 'utf8')

test('the route reports whether this instance can send mail', () => {
  assert.match(route, /mailConfigured: mailIsConfigured\(\)/)
})

test('the panel says which case it is when the mail is not sent, and the next step', () => {
  assert.doesNotMatch(panel, /cannot send mail, or it failed/)
  assert.match(panel, /This instance cannot send mail, so send this link yourself\./)
  assert.match(panel, /Sending the mail failed\. Send this link yourself\./)
})
