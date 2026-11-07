// Susy's piece of the office route registry: she is registered under her key, she walks to the desk of the person she
// pokes, pauses briefly, and carries the poke count as her badge. Needs the office's actor module (three.js).
// Run: node --import tsx --test tests/office-susy-piece.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routes } from '../app/office/actor'
import { POKE_STOP_SECONDS } from '../app/office/roles/susy'
import type { PokeCard, SusyData } from '../app/office/roles/susy'

const T0 = Date.UTC(2026, 10, 7, 14, 0, 0)
const MIN = 60_000

function data(over: Partial<PokeCard> = {}, now = T0 + 20 * MIN): SusyData {
  const card: PokeCard = {
    column: 'To do',
    assignee: null,
    tags: [],
    tagSince: {},
    enteredColumnAt: T0,
    updates: [{ by: 'wick', body: 'QUESTION: which one?', at: T0 }],
    lastChangeAt: T0,
    ...over
  }
  return { card, markers: [], now }
}

test('Susy is registered under her crew key', () => {
  assert.ok(routes.keys().includes('susy'))
})

test('no poke holds: Susy has no plan', () => {
  assert.equal(routes.planFor('susy', data({ updates: [] }, T0)), null)
})

test('a poke to Pia walks Susy to Pia\'s desk, pauses briefly, and shows the count as her badge', () => {
  routes.setDeskLookup(key => (key === 'pia' ? { x: 1, z: 2 } as never : null))
  const plan = routes.planFor('susy', data())
  assert.ok(plan)
  assert.deepEqual(plan.points, [{ x: 1, z: 2 }])
  assert.equal(plan.then, 'none')
  assert.equal(plan.stopSeconds, POKE_STOP_SECONDS)
  assert.equal(plan.badge, 1)
})

test('a poke to someone with no desk gives no walk', () => {
  routes.setDeskLookup(() => null)
  assert.equal(routes.planFor('susy', data()), null)
})
