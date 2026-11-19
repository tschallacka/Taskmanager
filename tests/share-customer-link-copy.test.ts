// The customer invite link in the Share dialog has a Copy button and says who it is for (Usher's UX finding). The address
// is kept when the link is made, since the form clears the email field after it. Source level.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/components/BoardShare.vue', import.meta.url), 'utf8')

test('the customer link box has a Copy button for the link', () => {
  const box = source.slice(source.indexOf('v-if="customerLink"'), source.indexOf('File and create link'))
  assert.match(box, /copy\(customerLink/)
  assert.match(box, /label="Copy"/)
})

test('the customer link box says which address the link is for', () => {
  const box = source.slice(source.indexOf('v-if="customerLink"'), source.indexOf('File and create link'))
  assert.match(box, /For \{\{ customerLinkFor \}\}/)
})

test('the address is kept when the link is made, before the form clears it', () => {
  const body = source.slice(source.indexOf('async function inviteCustomer()'), source.indexOf('refreshCustomers().catch'))
  assert.match(body, /customerLinkFor\.value = customerEmail\.value\.trim\(\)/)
})
