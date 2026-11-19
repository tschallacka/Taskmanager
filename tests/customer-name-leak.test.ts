// A customer never sees another customer's name (Boss's ruling). A project can be shared with several customers, and
// projects.customerId is only the first one; a contact of the second customer must not be shown the first one's name.
// Staff keep the name of the project's customer. Pure: the rule the project list and the pins answer with.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { customerNameForAudience } from '../server/utils/customerNames'

test('staff see the name of the project’s customer, as before', () => {
  assert.equal(customerNameForAudience({ audience: 'staff', staffName: 'Alpha', ownName: null }), 'Alpha')
  assert.equal(customerNameForAudience({ audience: 'staff', staffName: null, ownName: null }), null)
})

test('a contact sees the name of their own customer on a shared project, not the first customer’s', () => {
  // The project is filed under Alpha (first) and shared with Beta; a contact of Beta sees Beta.
  assert.equal(customerNameForAudience({ audience: 'customer', staffName: 'Alpha', ownName: 'Beta' }), 'Beta')
})

test('the project list answers a contact with their own customer’s name only (wiring)', () => {
  const route = readFileSync(new URL('../server/api/projects.ts', import.meta.url), 'utf8')
  assert.match(route, /customerNameForAudience\(\{ audience, staffName: customerName, ownName: ownCustomerNameOf\.get\(project\.id\) \}\)/)
  assert.match(route, /sharedPairsOf\(await customerIdsOf\(userId\)\)/)
})

test('the pinned boards answer a contact with their own customer’s name only (wiring)', () => {
  const pins = readFileSync(new URL('../server/utils/boardPins.ts', import.meta.url), 'utf8')
  assert.match(pins, /customerNameForAudience\(/)
  assert.match(pins, /sharedPairsOf\(await customerIdsOf\(userId\)\)/)
})

test('a contact with no customer on the project sees no name at all, never the first customer’s', () => {
  assert.equal(customerNameForAudience({ audience: 'customer', staffName: 'Alpha', ownName: undefined }), null)
})
