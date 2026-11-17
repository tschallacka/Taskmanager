// Quincy's QA violations on part 2, read from the source. First round (cards mwkz5uzyz1lksj9gp9, mwkz5suin3tbg7o5jq):
// 1. The Share dialog's customer line says "For . It works for that address only." before any address is typed. The line
//    shows only with a link, and it names the address the link was made for.
// 2. At 390 px the pending invite addresses are cut ('team-3...'), so the rows cannot be told apart.
// Second round, at 8d1f92e (subtasks mwl5n2lyasam50i3km, mwl5n5d4vv6ba1d0ux8, mwl5n7y9cp0e0eaq4xk):
// 3. The wrap splits words in the middle ('works', 'yes', 'address'): break-all, not break-words.
// 4. The Customers popup close button covers the end of the title at 390 px.
// 5. The team invite email field is about 105 px wide at 390 px, and its placeholder reads 'name@exar'.
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

test('a pending team invite address wraps at 390 px instead of being cut, and only at the browser\'s own break points', () => {
  const tag = openingTagBefore(teamInvites, '{{ invitation.email }}')
  assert.equal(/\btruncate\b/.test(tag), false, 'no truncate')
  assert.match(tag, /\bbreak-words\b/)
  assert.equal(/\bbreak-all\b/.test(tag), false, 'no break-all: it splits words')
})

test('a pending customer contact row wraps its address at 390 px, at word breaks', () => {
  const tag = openingTagBefore(customers, 'Invited, not accepted yet: {{ email }}')
  assert.equal(/\btruncate\b/.test(tag), false, 'no truncate')
  assert.match(tag, /\bbreak-words\b/)
  assert.equal(/\bbreak-all\b/.test(tag), false, 'no break-all: it splits words')
})

test('an invitation row (the link row) wraps its address at 390 px, at word breaks', () => {
  const tag = openingTagBefore(customers, 'Invited, not accepted yet: ${inv.email}')
  assert.equal(/\btruncate\b/.test(tag), false, 'no truncate')
  assert.match(tag, /\bbreak-words\b/)
  assert.equal(/\bbreak-all\b/.test(tag), false, 'no break-all: it splits words')
})

test('the Customers popup title leaves room for the close button at 390 px', () => {
  const modal = customers.slice(customers.indexOf('<UModal'), customers.indexOf('>', customers.indexOf('<UModal')) + 1)
  assert.match(modal, /ui="\{[^}]*title: '[^']*\bpr-1[02]\b/)
})

test('the team invite email field takes a full row on a phone, so it is not 105 px wide', () => {
  const input = openingTagBefore(teamInvites, 'data-invite-email')
  assert.match(input, /\bw-full\b/)
  assert.match(input, /\bsm:w-auto\b/)
})

// Quincy's third round (a810a38, subtask mwl5n5d4vv6ba1d0ux8): in the Members pending row the address shares the line with
// the Resend and Withdraw buttons, so at 390 px it is squeezed to a few characters ('team- / a810@exa / mple.test'). The row
// wraps, and the address takes a full line on a phone.
test('a pending team invite row wraps, and its address takes a full line on a phone', () => {
  const row = openingTagBefore(teamInvites, 'data-invite-open')
  assert.match(row, /\bflex-wrap\b/)
  const address = teamInvites.slice(teamInvites.indexOf('data-invite-open'), teamInvites.indexOf('{{ invitation.email }}'))
  const column = address.slice(address.lastIndexOf('<div'))
  assert.match(column, /\bbasis-full\b/)
  assert.match(column, /\bsm:basis-auto\b/)
})
