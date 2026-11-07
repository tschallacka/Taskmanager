// Tests for Janet Janitor's route: the state read from a card's cleanup tags, the walk for each state, and the planner the
// registry holds for her key. Needs no database. Run: node --import tsx --test tests/janet-route.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRouteRegistry } from '../app/office/actor'
import type { P } from '../app/office/layout'
import { JANITOR_KEY, janetPlan, janetPlanner, janetStateOf } from '../app/office/roles/janet'

const DESK: P = { x: 2, z: -6 }
const OTHER: P = { x: -9, z: -6 }

test('Janet is the crew key janet', () => {
  assert.equal(JANITOR_KEY, 'janet')
})

test('her state comes from the cleanup tags: walk, stand, sweep, or none', () => {
  assert.equal(janetStateOf(['ready to clean']), 'walk')
  assert.equal(janetStateOf(['ready to clean', 'clean plan']), 'stand')
  assert.equal(janetStateOf(['ready to clean', 'clean plan', 'cleaning granted']), 'sweep')
  assert.equal(janetStateOf(['ready to clean', 'cleaned']), null, 'a cleaned card has nothing left to do')
  assert.equal(janetStateOf(['verify CQ']), null)
})

test('a walk goes to the desk and then stands there; a granted cleanup goes to the desk and then sweeps', () => {
  assert.deepEqual(janetPlan('walk', DESK), { points: [DESK], then: 'stand' })
  assert.deepEqual(janetPlan('stand', DESK), { points: [DESK], then: 'stand' })
  assert.deepEqual(janetPlan('sweep', DESK), { points: [DESK], then: 'sweep' })
})

test('no desk, no plan: a card without a worker gives Janet nothing to walk to', () => {
  assert.equal(janetPlan('walk', null), null)
  assert.equal(janetPlan('sweep', null), null)
})

test('the planner reads the desk when it is asked, so the scene sets the desk per card', () => {
  let desk: P | null = DESK
  const planner = janetPlanner(() => desk)
  assert.deepEqual(planner('walk'), { points: [DESK], then: 'stand' })
  desk = OTHER
  assert.deepEqual(planner('sweep'), { points: [OTHER], then: 'sweep' })
  desk = null
  assert.equal(planner('walk'), null)
})

test('registered under her key, the registry answers for janet only, and only for a state', () => {
  const registry = createRouteRegistry()
  registry.register(JANITOR_KEY, janetPlanner(() => DESK))
  assert.deepEqual(registry.planFor('janet', 'walk'), { points: [DESK], then: 'stand' })
  assert.equal(registry.planFor('janet', null), null, 'no state, no walk')
  assert.equal(registry.planFor('pat', 'walk'), null, 'another key has no route here')
  assert.throws(() => registry.register('janet', janetPlanner(() => DESK)), /already registered/)
})
