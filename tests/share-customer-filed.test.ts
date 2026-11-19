// The Share dialog's customer picker shows the customer the project is filed under, selected (Pat's FAIL, 84fcb16; Boss's
// ruling: the placeholder shows only when no customer is filed). The filed customer is taken only when the picker holds it
// (CQ violation 5: a project of another team has no option for it). The picker starts on it, and the reset after a link is
// made goes back to it, not to the placeholder. Reads the component's source.
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

test('the filed customer counts only when the picker holds it (CQ 5)', () => {
  assert.match(source, /const filedChoice = computed\(\(\) => \(?customers\.value\.some\(customer => customer\.id === filedCustomerId\.value\) \? filedCustomerId\.value : ''\)?\)/)
})

test('the picker takes the filed customer when nothing is chosen yet', () => {
  assert.match(source, /watch\(filedChoice, \(id\) => \{\s*if \(!customerChoice\.value\) customerChoice\.value = id\s*\}\)/)
})

// Usher's F1 (card mwjfx58bi6p4dqqeo8, Wanted (d)): after a link is made the picker shows the customer the server
// filed the project under (the one just created or picked), not the stale filed id and not the placeholder.
test('after a link is made the picker shows the customer the server returned', () => {
  const body = functionBody('inviteCustomer')
  assert.match(body, /customerChoice\.value = answer\.customerId/)
  assert.equal(body.includes('customerChoice.value = filedChoice.value'), false)
  assert.equal(body.includes(`customerChoice.value = ''`), false)
})

// The picker is cleared to the placeholder only when a new customer name is typed, so the typed name is not blocked.
test('the picker is cleared to the placeholder only by a typed new name', () => {
  assert.equal(source.split(`customerChoice.value = ''`).length - 1, 1)
  assert.match(source, /watch\(customerNewName, \(name\) => \{\s*if \(name\.trim\(\)\) customerChoice\.value = ''/)
})
