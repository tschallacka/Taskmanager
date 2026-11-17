// The Share dialog's customer picker takes a tap at 390 px. The Nuxt UI select (USelect) inside the dialog did not
// take a pointer pick (the list closed, the picker still said "Choose the customer"), while the keyboard worked
// (Usher's bug mwkuacvx99p269hf7za). The picker is a native select, as the other pickers in this dialog are.
// Reads the component's source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/components/BoardShare.vue', import.meta.url), 'utf8')
const section = source.slice(source.indexOf('data-share-customer'), source.indexOf('data-share-customer') + 2500)

test('the customer picker is a native select, not USelect', () => {
  assert.match(section, /<select[\s\S]*?v-model="customerChoice"/)
  assert.equal(section.includes('<USelect'), false)
})

test('the native select starts on the placeholder option "Choose the customer"', () => {
  assert.match(section, /<option value="">\s*Choose the customer\s*<\/option>/)
})

test('the native select lists every customer of the team by id', () => {
  assert.match(section, /<option\s+v-for="customer in customers"\s+:key="customer\.id"\s+:value="customer\.id"\s*>\s*\{\{ customer\.name \}\}/)
})

test('the USelect item list is gone from the script', () => {
  assert.equal(source.includes('customerItems'), false)
})
