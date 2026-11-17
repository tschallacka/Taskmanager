// The project Share dialog names its customer invitation control "Invite by email", as the card asks. Reads the component's
// source: the label is the one thing a reader of the dialog sees first.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/components/BoardShare.vue', import.meta.url), 'utf8')

test('the customer invitation control in the Share dialog is headed "Invite by email"', () => {
  assert.match(source, /data-share-customer[\s\S]*?Invite by email/)
})

test('the old heading is gone', () => {
  assert.equal(source.includes('Invite as a customer contact'), false)
})
