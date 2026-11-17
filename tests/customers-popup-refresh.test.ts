// The Customers popup updates at once after Create link: the customer's counts and its contacts reload, and the project
// count of a customer is the one the server gives (a project shared through the join table counts too). Source level.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/components/CustomersModal.vue', import.meta.url), 'utf8')

function functionBody(name: string): string {
  const start = source.indexOf(`async function ${name}(`)
  assert.ok(start >= 0, `${name} is not in the popup`)
  const next = source.indexOf('\nasync function ', start + 1)
  const plain = source.indexOf('\nfunction ', start + 1)
  const ends = [next, plain].filter(index => index > 0)
  return source.slice(start, ends.length ? Math.min(...ends) : undefined)
}

test('after Create link the popup reloads the customers (counts) and that customer’s contacts', () => {
  const body = functionBody('handleInvite')
  assert.match(body, /Promise\.all\(\[[\s\S]*?\brefresh\(\)[\s\S]*?\]\)/)
  assert.match(body, /loadDetail\(customerId\)/)
})

test('the popup counts a customer’s projects from the server, not from project.customerId alone', () => {
  assert.doesNotMatch(source, /projects\.value\.filter\(project => project\.customerId === customerId\)/)
  assert.match(source, /function customerProjectCount\(customerId: string\)[\s\S]*?customers\.value/)
})
