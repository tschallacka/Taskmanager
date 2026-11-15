// Where the invitation page's two buttons go. The primary one opens the registration form; the plain link under
// it opens sign-in for someone who already has an account. Pure. Run:
//   node --import tsx --test tests/invite-links.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { inviteLinks } from '../app/utils/inviteLinks'

test('the primary button opens sign-up with the invitation token', () => {
  assert.equal(inviteLinks('abc123').primary, '/login?invite=abc123&signup=1')
})

test('the plain link under it opens sign-in with the same token', () => {
  assert.equal(inviteLinks('abc123').signIn, '/login?invite=abc123&signin=1')
})

test('a token with characters that need escaping is encoded in both links', () => {
  const links = inviteLinks('a b&c=d')
  assert.equal(links.primary, '/login?invite=a%20b%26c%3Dd&signup=1')
  assert.equal(links.signIn, '/login?invite=a%20b%26c%3Dd&signin=1')
})
