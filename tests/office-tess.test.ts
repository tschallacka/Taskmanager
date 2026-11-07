// Tess Triage's piece of the route registry: she sorts at her table while a finding is on the board, and her badge
// counts them. Needs the repository's three.js (CI has it); the registry is the office's own.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routes } from '../app/office/actor'
import { FINDING_TAGS, SORTING_TABLE, isOpenFinding, openFindings } from '../app/office/roles/tess'

test('a finding is a card with a reviewer violation or a bug tag, until it is triaged', () => {
  for (const tag of FINDING_TAGS) assert.equal(isOpenFinding([tag]), true, `${tag} is a finding`)
  assert.equal(isOpenFinding(['ux violation', 'triaged']), false, 'a triaged finding is out of the pile')
  assert.equal(isOpenFinding(['pm approved']), false, 'an approval is not a finding')
  assert.equal(isOpenFinding([]), false)
})

test('the open findings are counted across the board', () => {
  assert.equal(openFindings([[], ['bug'], ['cq violation', 'triaged'], ['qa violation']]), 2)
  assert.equal(openFindings([]), 0)
})

test('Tess is registered under her key, and her plan walks to the table and stands there with the count as badge', () => {
  assert.ok(routes.keys().includes('tess'), 'tess is registered')
  assert.deepEqual(routes.planFor('tess', { cardTags: [['bug'], ['ux violation']] }), {
    points: [SORTING_TABLE], then: 'stand', badge: 2
  })
})

test('Tess has no plan while the pile is empty', () => {
  assert.equal(routes.planFor('tess', { cardTags: [['triaged'], ['verify ux']] }), null)
})
