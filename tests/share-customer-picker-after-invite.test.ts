// The Share dialog's customer picker after a customer invite (Usher's F1 on card mwjfx58bi6p4dqqeo8, Wanted (d)).
// After "File and create link" the project is filed under the customer, so the picker must show that customer, not
// the placeholder; and a stale picker choice must not block the next new customer name ("Choose one customer, or type
// a new name, not both."). Reads the component's source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/components/BoardShare.vue', import.meta.url), 'utf8')
const invite = source.slice(source.indexOf('async function inviteCustomer'), source.indexOf('refreshCustomers().catch'))
const section = source.slice(source.indexOf('data-share-customer'), source.indexOf('Invite a guest to this board'))

test('after an invite the picker takes the customer the server returned (the one just created or picked)', () => {
  assert.match(invite, /await refreshCustomers\(\)[\s\S]*?customerChoice\.value = answer\.customerId/)
  assert.match(invite, /filedCustomerId\.value = answer\.customerId/)
})

test('the picker no longer reads the stale filed customer after an invite', () => {
  assert.equal(invite.includes('customerChoice.value = filedChoice.value'), false)
})

test('typing a new customer name clears the picker choice, so the new name is not blocked', () => {
  assert.match(source, /watch\(customerNewName, \(name\) => \{\s*if \(name\.trim\(\)\) customerChoice\.value = ''/)
})

test('picking a customer in the picker clears a typed new name, so the two never both hold a value', () => {
  assert.match(section, /<AppSelect[\s\S]*?@update:model-value="customerNewName = ''"/)
})
