// The address an invitation is tied to, carried to the sign-in and sign-up forms so it is prefilled and locked there.
// Only a well-formed address is carried; anything else is dropped. Pure. Run:
//   node --import tsx --test tests/locked-email.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { lockedEmailFromQuery, inviteFormLink } from '../app/utils/lockedEmail'

test('the form link carries the token and, when the invitation has one, the address', () => {
  assert.equal(inviteFormLink('abc', 'signup', 'ada@example.com'), '/login?invite=abc&signup=1&email=ada%40example.com')
  assert.equal(inviteFormLink('abc', 'signin', null), '/login?invite=abc&signin=1')
})

test('the token is encoded in the form link', () => {
  assert.equal(inviteFormLink('a b', 'signin', null), '/login?invite=a%20b&signin=1')
})

test('the address is taken from the query only when it is well formed', () => {
  assert.equal(lockedEmailFromQuery('ada@example.com'), 'ada@example.com')
  assert.equal(lockedEmailFromQuery('  ada@example.com  '), 'ada@example.com')
  assert.equal(lockedEmailFromQuery('not an address'), '')
  assert.equal(lockedEmailFromQuery(undefined), '')
  assert.equal(lockedEmailFromQuery(['a@b.co', 'x@y.co']), '')
})
