// The viewer's own customer name per project is built in one helper (CQ should 2 on 12c5c83, Boss's ruling): the first
// pair per project wins, and server/api/projects.ts and server/utils/boardPins.ts both call it. Pure, plus source level.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { ownCustomerNameMap } from '../server/utils/customerNames'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the first pair per project gives the name; a project with no pair has none', () => {
  const map = ownCustomerNameMap([
    { projectId: 'p1', customerName: 'Ana' },
    { projectId: 'p1', customerName: 'Ben' },
    { projectId: 'p2', customerName: 'Cy' }
  ])
  assert.equal(map.get('p1'), 'Ana')
  assert.equal(map.get('p2'), 'Cy')
  assert.equal(map.has('p3'), false)
  assert.equal(ownCustomerNameMap([]).size, 0)
})

test('both callers use the helper and keep no loop of their own', () => {
  for (const path of ['server/api/projects.ts', 'server/utils/boardPins.ts']) {
    const source = read(path)
    assert.match(source, /ownCustomerNameMap\(/, `${path} calls the helper`)
    assert.doesNotMatch(source, /ownCustomerNameOf\.has\(/, `${path} has no loop of its own`)
  }
})
