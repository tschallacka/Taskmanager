// Tests for the office's shared piece: the prop list the rig carries, the gesture table, the janitor's state derived
// from the cleanup tags on a card, the route registry the role pieces plug into, and the walk along a route.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GESTURE_NAMES, cleaningStateOf, createRouteRegistry, followPlan, routes } from '../app/office/actor'
import type { WalkPlan } from '../app/office/actor'
import { PROP_NAMES } from '../app/office/meshes'

test('the rig carries the shared piece\'s props, each once: broom, mop and magnifier', () => {
  for (const name of ['broom', 'mop', 'magnifier']) {
    assert.equal(PROP_NAMES.filter(prop => prop === name).length, 1, `${name} is a prop, once`)
  }
  assert.equal(new Set(PROP_NAMES).size, PROP_NAMES.length, 'no prop is listed twice')
})

test('every gesture the actor can play is in the table, and sweep is one of them', () => {
  assert.ok(GESTURE_NAMES.includes('sweep'))
  assert.equal(new Set(GESTURE_NAMES).size, GESTURE_NAMES.length)
})

test('a janitor walks to a desk when the card is ready to clean, stands while the plan waits, and sweeps once granted', () => {
  assert.equal(cleaningStateOf(['ready to clean']), 'walk')
  assert.equal(cleaningStateOf(['ready to clean', 'clean plan']), 'stand')
  assert.equal(cleaningStateOf(['ready to clean', 'clean plan', 'cleaning granted']), 'sweep')
})

test('no cleaning tags, or a finished cleanup, is no state: nothing is shown for a board without a janitor job', () => {
  assert.equal(cleaningStateOf([]), null)
  assert.equal(cleaningStateOf(['verify CQ', 'blocked']), null)
  assert.equal(cleaningStateOf(['ready to clean', 'clean plan', 'cleaning granted', 'cleaned']), null)
})

// An example role's route: from the desk to the bin and back, then sweep. Used only by these tests.
const EXAMPLE_DESK = { x: 1, z: 2 }
const EXAMPLE_BIN = { x: 4, z: 2 }
function exampleRoute(state: 'walk' | 'stand' | 'sweep'): WalkPlan | null {
  if (state === 'walk') return { points: [EXAMPLE_BIN, EXAMPLE_DESK], then: 'none' }
  if (state === 'sweep') return { points: [EXAMPLE_DESK], then: 'sweep' }
  return null
}

test('a role registers its route once, under a crew key, and gets its plan for a state', () => {
  const registry = createRouteRegistry()
  registry.register('example', exampleRoute)
  assert.deepEqual(registry.keys(), ['example'])
  assert.deepEqual(registry.planFor('example', 'walk'), { points: [EXAMPLE_BIN, EXAMPLE_DESK], then: 'none' })
  assert.equal(registry.planFor('example', 'stand'), null, 'no route for a state that has no walk')
  assert.equal(registry.planFor('example', null), null, 'no state, no route')
  assert.equal(registry.planFor('nobody', 'walk'), null, 'a key with no registration has no route')
})

test('a second registration for a key is refused, not silently replaced; a key that is not a crew key is refused', () => {
  const registry = createRouteRegistry()
  registry.register('example', exampleRoute)
  assert.throws(() => registry.register('example', () => null), /already registered/)
  assert.throws(() => registry.register('Example', exampleRoute), /not a crew key/)
  assert.throws(() => registry.register('../x', exampleRoute), /not a crew key/)
  assert.deepEqual(registry.planFor('example', 'walk'), { points: [EXAMPLE_BIN, EXAMPLE_DESK], then: 'none' })
})

test('the office registry starts empty: no role piece is shown until its own piece registers', () => {
  assert.deepEqual(routes.keys(), [])
  assert.equal(routes.planFor('janet', 'walk'), null)
})

test('an actor walks the plan\'s points in order and then sweeps', async () => {
  const calls: string[] = []
  const actor = {
    walk: async (points: { x: number, z: number }[]) => { calls.push(`walk ${points.map(p => `${p.x},${p.z}`).join(' ')}`) },
    play: async (name: string) => { calls.push(`play ${name}`) }
  }
  await followPlan(actor, { points: [EXAMPLE_BIN, EXAMPLE_DESK], then: 'sweep' })
  assert.deepEqual(calls, ['walk 4,2 1,2', 'play sweep'])
})

test('a plan with no points and nothing after it does nothing; a plan that stands by does not play a gesture', async () => {
  const calls: string[] = []
  const actor = {
    walk: async () => { calls.push('walk') },
    play: async () => { calls.push('play') }
  }
  await followPlan(actor, { points: [], then: 'none' })
  await followPlan(actor, { points: [EXAMPLE_DESK], then: 'stand' })
  assert.deepEqual(calls, ['walk'])
})
