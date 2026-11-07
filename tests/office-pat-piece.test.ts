// Pat's piece of the office route registry: she is registered under her key, she stands at the desk of the worker whose
// card she checks, and she has no walk for a card with no worker or no check to make. Needs the office's actor (three.js).
// Run: node --import tsx --test tests/office-pat-piece.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routes } from '../app/office/actor'
import { CHECK_STOP_SECONDS } from '../app/office/roles/pat'
import type { PatCard, PatData } from '../app/office/roles/pat'

const T0 = Date.UTC(2026, 10, 7, 15, 0, 0)

function data(over: Partial<PatCard> = {}, worker = 'wick'): PatData {
  return {
    card: { column: 'Verify PM', tags: [], minutesLogged: 20, attachments: 0, updates: [], ...over },
    worker
  }
}

test('Pat is registered under her crew key', () => {
  assert.ok(routes.keys().includes('pat'))
})

test('a card in Verify PM with no verdict: Pat walks to the worker\'s desk and stands there', () => {
  routes.setDeskLookup(key => (key === 'wick' ? { x: 4, z: 6 } as never : null))
  const plan = routes.planFor('pat', data())
  assert.ok(plan)
  assert.deepEqual(plan.points, [{ x: 4, z: 6 }])
  assert.equal(plan.then, 'stand')
  assert.equal(plan.stopSeconds, CHECK_STOP_SECONDS)
})

test('a card with a verdict already posted gives Pat no plan', () => {
  routes.setDeskLookup(() => ({ x: 0, z: 0 } as never))
  const done = data({ updates: [{ by: 'pat', body: 'PRECHECK: pass', at: T0 }] })
  assert.equal(routes.planFor('pat', done), null)
})

test('a card outside Verify PM gives Pat no plan', () => {
  routes.setDeskLookup(() => ({ x: 0, z: 0 } as never))
  assert.equal(routes.planFor('pat', data({ column: 'To do' })), null)
})

test('a card with no worker has no desk, so no walk', () => {
  routes.setDeskLookup(() => ({ x: 0, z: 0 } as never))
  assert.equal(routes.planFor('pat', data({}, '')), null)
})
