// Accepting an invitation sent to an address: the signed-in account may accept when the address is one of its verified
// addresses, or when the account's own address is the invited one (the account was created through the link, so its
// holder is the invitee). A different address is refused either way. Pure: no database.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { invitedAddressIsMine } from '../server/utils/customerInviteRules'

test('a verified address that matches the invited one is accepted', () => {
  assert.equal(invitedAddressIsMine({ invitedEmail: 'ana@example.test', verifiedAddresses: ['ana@example.test'], signedInEmail: null }), true)
})

test('an account created through the link, with its own unverified address matching the invited one, is accepted', () => {
  assert.equal(invitedAddressIsMine({ invitedEmail: 'ana@example.test', verifiedAddresses: [], signedInEmail: 'ana@example.test' }), true)
})

test('the match ignores case', () => {
  assert.equal(invitedAddressIsMine({ invitedEmail: 'Ana@Example.test', verifiedAddresses: [], signedInEmail: 'ana@example.TEST' }), true)
})

test('a signed-in account with another, unverified address is refused', () => {
  assert.equal(invitedAddressIsMine({ invitedEmail: 'ana@example.test', verifiedAddresses: [], signedInEmail: 'ben@example.test' }), false)
})

test('a verified address that is not the invited one does not accept the link', () => {
  assert.equal(invitedAddressIsMine({ invitedEmail: 'ana@example.test', verifiedAddresses: ['ben@example.test'], signedInEmail: 'ben@example.test' }), false)
})

test('no signed-in account: refused', () => {
  assert.equal(invitedAddressIsMine({ invitedEmail: 'ana@example.test', verifiedAddresses: [], signedInEmail: null }), false)
})
