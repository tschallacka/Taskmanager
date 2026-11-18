// The Share dialog's customer picker shows the customer the project is filed under, selected (Pat's FAIL, 84fcb16; Boss's
// ruling: the placeholder shows only when no customer is filed). The picker starts on the filed customer, and the reset
// after a link is made goes back to it, not to the placeholder. Reads the component's source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/components/BoardShare.vue', import.meta.url), 'utf8')

function functionBody(name: string): string {
  const start = source.indexOf(`async function ${name}(`)
  assert.ok(start >= 0, `${name} is in the dialog`)
  return source.slice(start, source.indexOf('\n}\n', start))
}

test('the dialog keeps the customer the project is filed under', () => {
  assert.match(source, /const filedCustomerId = ref\(''\)/)
})

test('the project is read with the listing, and its customer becomes the filed one', () => {
  assert.match(source, /const project = await untypedFetch<\{ customerId\?: string \| null \}>\(base\.value\)\.catch\(\(\) => null\)/)
  assert.match(source, /filedCustomerId\.value = project\?\.customerId \?\? ''/)
})

test('the picker starts on the filed customer when nothing is chosen yet', () => {
  assert.match(source, /if \(!customerChoice\.value\) customerChoice\.value = filedCustomerId\.value/)
})

test('the reset after a link is made keeps the filed customer, not the placeholder', () => {
  const body = functionBody('inviteCustomer')
  assert.match(body, /customerChoice\.value = filedCustomerId\.value/)
  assert.equal(body.includes("customerChoice.value = ''"), false)
})

test('nothing in the dialog clears the picker to the placeholder while a customer is filed', () => {
  assert.equal(source.includes("customerChoice.value = ''"), false)
})
