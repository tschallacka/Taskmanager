// Quincy's two QA violations on part 2 (cards mwkz5uzyz1lksj9gp9 and mwkz5suin3tbg7o5jq), read from the source:
// 1. The Share dialog's customer line says "For . It works for that address only." before any address is typed. The line
//    shows only with a link, and it names the address the link was made for.
// 2. At 390 px the pending invite addresses are cut ('team-3...'), so the rows cannot be told apart. The address wraps in
//    the team invite list, the customer's pending contact row and the invitation row.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const boardShare = readFileSync(new URL('../app/components/BoardShare.vue', import.meta.url), 'utf8')
const teamInvites = readFileSync(new URL('../app/components/TeamInvitesPanel.vue', import.meta.url), 'utf8')
const customers = readFileSync(new URL('../app/components/CustomersModal.vue', import.meta.url), 'utf8')

// The opening tag of the element whose text contains `text`.
function openingTagBefore(source: string, text: string): string {
  const at = source.indexOf(text)
  return source.slice(source.lastIndexOf('<', at), source.indexOf('>', at) + 1)
}

test('the Share customer line shows only with a link, so it never reads "For ."', () => {
  const tag = openingTagBefore(boardShare, 'For {{ customerLinkFor }}')
  assert.match(tag, /v-if="customerLink"/)
})

test('a pending team invite address wraps at 390 px instead of being cut', () => {
  const tag = openingTagBefore(teamInvites, '{{ invitation.email }}')
  assert.equal(/\btruncate\b/.test(tag), false, 'no truncate')
  assert.match(tag, /\bbreak-all\b/)
})

test('a pending customer contact row wraps its address at 390 px', () => {
  const tag = openingTagBefore(customers, 'Invited, not accepted yet: {{ email }}')
  assert.equal(/\btruncate\b/.test(tag), false, 'no truncate')
  assert.match(tag, /\bbreak-all\b/)
})

test('an invitation row (the link row) wraps its address at 390 px', () => {
  const tag = openingTagBefore(customers, 'Invited, not accepted yet: ${inv.email}')
  assert.equal(/\btruncate\b/.test(tag), false, 'no truncate')
  assert.match(tag, /\bbreak-all\b/)
})
