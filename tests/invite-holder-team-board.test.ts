// A team or board invitee who signed up through the link is the invitee (the part 1 rule, invitedAddressIsMine): the page
// does not say 'sent to another address' to them, the accept route admits them, and the invite page accepts once by
// itself. Covers the token path, the verified path and the rejected path. Pure rule plus source checks. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/invite-holder-team-board.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { invitedAddressIsMine } from '../server/utils/customerInviteRules'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('token path: an account made through the link, with its own unverified address, is the invitee', () => {
  assert.equal(invitedAddressIsMine({ invitedEmail: 'bo@example.test', verifiedAddresses: [], signedInEmail: 'bo@example.test' }), true)
})

test('verified path: a verified address that is the invited one is the invitee', () => {
  assert.equal(invitedAddressIsMine({ invitedEmail: 'bo@example.test', verifiedAddresses: ['bo@example.test'], signedInEmail: null }), true)
})

test('rejected path: another signed-in address is not the invitee', () => {
  assert.equal(invitedAddressIsMine({ invitedEmail: 'bo@example.test', verifiedAddresses: [], signedInEmail: 'cy@example.test' }), false)
})

test('the preview says forYou with the same rule the accept route uses', () => {
  const preview = read('server/api/invitations/[token]/index.get.ts')
  assert.match(preview, /const forYou = session\s*\?\s*invitedAddressIsMine\(/)
  assert.doesNotMatch(preview, /const forYou = session \? \(await addressesOfUser\(session\.user\.id\)\)\.includes/)
})

test('the accept route admits a team or board invitee with the same rule', () => {
  const accept = read('server/api/invitations/[token]/accept.post.ts')
  assert.match(accept, /invitedAddressIsMine\(\{/)
})

test('the invite page accepts a team or board link once by itself when it is for the signed-in account', () => {
  const page = read('app/pages/invite/[token].vue')
  assert.match(page, /invite\.forYou === true/)
  assert.match(page, /autoAccepted/)
})
