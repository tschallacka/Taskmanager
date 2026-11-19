// The Share dialog's customer picker takes a tap at 390 px. The Nuxt UI select (USelect) inside the dialog did not
// take a pointer pick (the list closed, the picker still said "Choose the customer"), while the keyboard worked
// (Usher's bug mwkuacvx99p269hf7za). The picker is AppSelect, the app's select on top of Nuxt UI, as every other
// select in the app is since 0.48.0 (no native selects). Reads the component's source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/components/BoardShare.vue', import.meta.url), 'utf8')
const section = source.slice(source.indexOf('data-share-customer'), source.indexOf('data-share-customer') + 2500)

test('the customer picker is AppSelect, not a native select and not USelect', () => {
  assert.match(section, /<AppSelect[\s\S]*?v-model="customerChoice"/)
  assert.equal(section.includes('<select'), false)
  assert.equal(section.includes('<USelect'), false)
})

test('the AppSelect shows the placeholder "Choose the customer"', () => {
  assert.match(section, /<AppSelect[\s\S]*?placeholder="Choose the customer"/)
})

test('the AppSelect lists every customer of the team by id and name', () => {
  assert.match(section, /<AppSelect[\s\S]*?:options="customerOptions"/)
  assert.match(source, /const customerOptions = computed\(\(\) => customers\.value\.map\(customer => \(\{ label: customer\.name, value: customer\.id \}\)\)\)/)
})

test('the USelect item list is gone from the script', () => {
  assert.equal(source.includes('customerItems'), false)
})

// The changelog bullet describes the code (CQ violation 4). A phone tap on the AppSelect picker has no 390 px pass yet,
// so the bullet makes no tap claim.
test('the changelog bullet names AppSelect, not a native select, and claims no phone tap yet', () => {
  // The release folds the fragment into CHANGELOG.md, so read the changelog once the fragment is gone.
  const fragmentUrl = new URL('../changelog.d/mwjfx58bi6p4dqqeo8-invite-by-email-part-2.md', import.meta.url)
  const fragment = readFileSync(existsSync(fragmentUrl) ? fragmentUrl : new URL('../CHANGELOG.md', import.meta.url), 'utf8')
  const bullet = fragment.split('\n').find(line => line.includes('customer picker')) ?? ''
  assert.ok(bullet.length > 0, 'the bullet about the customer picker is in the fragment')
  assert.match(bullet, /AppSelect|the app's own select/)
  assert.doesNotMatch(bullet, /native select/)
  assert.doesNotMatch(bullet, /takes a tap on a phone/)
})
