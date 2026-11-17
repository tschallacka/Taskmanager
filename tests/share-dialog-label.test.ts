// The project Share dialog has two invite sections, each named for what it does (Usher's finding): the customer section
// files the project under a customer, the board section invites a guest to the board. Each heading is different, and the
// customer section says a personal project cannot have a customer. Reads the component's source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/components/BoardShare.vue', import.meta.url), 'utf8')

test('the customer control is headed "Invite a customer contact"', () => {
  assert.match(source, /data-share-customer[\s\S]*?Invite a customer contact/)
})

test('the board guest control is headed "Invite a guest to this board"', () => {
  assert.match(source, /Invite a guest to this board/)
})

test('the two invite headings are different, and neither old heading is left', () => {
  assert.equal(source.includes('Invite as a customer contact'), false)
  assert.equal(source.includes('Invite with email'), false)
  assert.equal(source.includes('>\n              Invite by email\n'), false)
})

test('the customer control says only a team project can have a customer', () => {
  assert.match(source, /Only a project of a team can have a customer/)
})
