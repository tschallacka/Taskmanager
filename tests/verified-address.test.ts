// An account's primary address counts as proof of the address only when it is verified: an unverified address is
// anyone's to type, so an invitation tied to it must not be taken by the account that typed it. Pure. Run:
//   node --import tsx --test tests/verified-address.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { primaryAddressOf } from '../server/utils/verifiedAddress'

test('a verified primary address counts', () => {
  assert.deepEqual(primaryAddressOf('ada@example.com', true), ['ada@example.com'])
})

test('an unverified primary address does not count', () => {
  assert.deepEqual(primaryAddressOf('ada@example.com', false), [])
})

test('no primary address: nothing', () => {
  assert.deepEqual(primaryAddressOf(null, true), [])
  assert.deepEqual(primaryAddressOf(undefined, false), [])
})
