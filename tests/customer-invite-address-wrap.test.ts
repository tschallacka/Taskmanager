// The invitation links row in the Customers popup squeezed a pending address at 390 px ('example.te / st'): the expiry sat
// beside it in the same flex row. The address now takes the row's width, and 'expires <date>' is a line of its own under it
// (Usher's QA 2 on card mwjfx58bi6p4dqqeo8). Reads the component's source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/components/CustomersModal.vue', import.meta.url), 'utf8')
const start = source.indexOf('v-for="inv in invitations"')
const row = source.slice(source.lastIndexOf('<div', start), source.indexOf('<UButton', start))
const addressTag = row.slice(row.lastIndexOf('<p', row.indexOf('Invited, not accepted yet')), row.indexOf('Invited, not accepted yet') + 1)
const expiresTag = row.slice(row.lastIndexOf('<span', row.indexOf('expires {{')), row.indexOf('expires {{'))

test('the invitation link row lets the address take the row width', () => {
  assert.match(row.slice(0, row.indexOf('>') + 1), /\bjustify-between\b/)
  assert.match(row, /<div class="min-w-0 flex-1">/)
})

test('the address breaks at word breaks only, never cut or split inside a word', () => {
  assert.match(addressTag, /\bbreak-words\b/)
  assert.equal(/\btruncate\b|\bbreak-all\b/.test(addressTag), false)
})

test('\'expires <date>\' is a line of its own under the address, not a flex sibling beside it', () => {
  assert.match(expiresTag, /\bblock\b/)
})
