// The shared-customer rule (the customer_projects join table, and projects.customerId as the first customer) is read in one
// place (CQ should 2, Nina on a05ef12): sharedLinks. Every other lookup in customerProjects.ts goes through it, except the
// SQL filter projectsOfCustomers. Source level.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../server/utils/customerProjects.ts', import.meta.url), 'utf8')

test('the join table union is written once, in sharedLinks', () => {
  assert.match(source, /async function sharedLinks\(/)
  assert.equal(source.split('projects.customerId').length - 1, 2, 'projects.customerId is read in sharedLinks and in the SQL filter only')
})

test('the lookups go through sharedLinks', () => {
  for (const name of ['sharedCustomerIdsOf', 'projectsSharedWith', 'sharedPairsOf']) {
    const start = source.indexOf(`export async function ${name}(`)
    assert.ok(start >= 0, `${name} exists`)
    const body = source.slice(start, source.indexOf('\n}\n', start))
    assert.match(body, /sharedLinks\(/, `${name} uses sharedLinks`)
  }
})
