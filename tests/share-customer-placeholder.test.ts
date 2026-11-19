// Boss's ruling on Quincy's check 3 (mwn589pk): a filed customer that is not in the active team's list shows the picker's
// placeholder and no stale id, and the invite posts only what the picker holds. The repo has no component renderer (no
// test-utils, no jsdom), so this reads BoardShare.vue like the other dialog tests do (share-customer-filed.test.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/components/BoardShare.vue', import.meta.url), 'utf8')

function functionBody(name: string): string {
  const start = source.indexOf(`async function ${name}(`)
  assert.ok(start >= 0, `${name} is in the dialog`)
  return source.slice(start, source.indexOf('\n}\n', start))
}

test('the picker starts on the placeholder and is bound to the picker value only', () => {
  assert.match(source, /const customerChoice = ref\(''\)/)
  assert.match(source, /<AppSelect\s+v-model="customerChoice"/)
})

test('a filed customer not in the active list is not taken: the picker value stays the placeholder', () => {
  // The filed id only counts when the team's customer list holds it, so an id from another team never reaches the picker.
  assert.match(source, /const filedChoice = computed\(\(\) => \(?customers\.value\.some\(customer => customer\.id === filedCustomerId\.value\) \? filedCustomerId\.value : ''\)?\)/)
  assert.match(source, /watch\(filedChoice, \(id\) => \{\s*if \(!customerChoice\.value\) customerChoice\.value = id\s*\}\)/)
})

test('the invite posts the picker value, never the filed id, so no stale id is sent', () => {
  const body = functionBody('inviteCustomer')
  assert.match(body, /body: \{ customerId: customerChoice\.value,/)
  assert.equal(body.includes('customerId: filedCustomerId'), false)
  assert.equal(body.includes('customerId: filedChoice'), false)
})
