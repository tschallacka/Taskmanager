// Tests for the office's shared piece: the prop list the rig carries, the gesture table, the janitor's state derived
// from the cleanup tags on a card, the route registry the role pieces plug into, and the walk along a route.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GESTURE_NAMES, cleaningStateOf, createRouteRegistry, followPlan, routes } from '../app/office/actor'
import { PROP_NAMES } from '../app/office/meshes'
import '../app/office/roles/janet'

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

// Two dummy roles with their own kinds of state: a janitor-like one (tags) and a poker-like one (a count of pokes).
const DESK = { x: 1, z: 2 }
const BIN = { x: 4, z: 2 }

function registryWithDesks() {
  const registry = createRouteRegistry()
  registry.setDeskLookup(personKey => (personKey === 'wren' ? DESK : null))
  return registry
}

test('a role brings its own state: the registry gives its plan from the data the role reads its state from', () => {
  const registry = registryWithDesks()
  registry.register<{ tags: string[] }, 'walk' | 'sweep'>('example', {
    stateOf: data => (data.tags.includes('go') ? 'walk' : data.tags.includes('done') ? 'sweep' : null),
    plan: state => ({ points: [BIN], then: state === 'walk' ? 'none' : 'sweep' })
  })
  registry.register<{ pokes: number }, { pokes: number }>('poker', {
    stateOf: data => (data.pokes > 0 ? { pokes: data.pokes } : null),
    plan: state => ({ points: [DESK], then: 'stand', badge: state.pokes })
  })
  assert.deepEqual(registry.keys(), ['example', 'poker'])
  assert.deepEqual(registry.planFor('example', { tags: ['go'] }), { points: [BIN], then: 'none' })
  assert.deepEqual(registry.planFor('example', { tags: ['done'] }), { points: [BIN], then: 'sweep' })
  assert.equal(registry.planFor('example', { tags: [] }), null, 'no state from the data, no plan')
  assert.deepEqual(registry.planFor('poker', { pokes: 3 }), { points: [DESK], then: 'stand', badge: 3 })
  assert.equal(registry.planFor('poker', { pokes: 0 }), null)
})

test('a second registration for a key is refused, not silently replaced; a key that is not a crew key is refused', () => {
  const registry = registryWithDesks()
  const piece = { stateOf: () => 'x' as const, plan: () => ({ points: [], then: 'none' as const }) }
  registry.register('example', piece)
  assert.throws(() => registry.register('example', piece), /already registered/)
  assert.throws(() => registry.register('Example', piece), /not a crew key/)
  assert.throws(() => registry.register('../x', piece), /not a crew key/)
})

test('an unknown key plans nothing', () => {
  const registry = registryWithDesks()
  assert.equal(registry.planFor('nobody', { tags: ['go'] }), null)
})

test('walking to a desk names only the person key: the target comes from the desk lookup, and a person without a desk has none', () => {
  const registry = registryWithDesks()
  assert.deepEqual(registry.deskOf('wren'), DESK)
  assert.equal(registry.deskOf('ghost'), null)
  assert.deepEqual(registry.walkToDesk('wren', 'sweep', { badge: 2 }), { points: [DESK], then: 'sweep', badge: 2 })
  assert.equal(registry.walkToDesk('ghost', 'sweep'), null)
})

test('the office registry has Janet\'s piece only: her state comes from her cleanup tags, and no state means no route', () => {
  assert.deepEqual(routes.keys(), ['janet'])
  assert.equal(routes.planFor('janet', { tags: [], worker: 'wren' }), null, 'no cleanup state, no route')
  assert.equal(routes.planFor('nobody', { tags: ['ready to clean'], worker: 'wren' }), null)
})

test('an actor walks the plan\'s points in order, then waits, then sweeps', async () => {
  const calls: string[] = []
  const actor = {
    walk: async (points: { x: number, z: number }[]) => { calls.push(`walk ${points.map(p => `${p.x},${p.z}`).join(' ')}`) },
    play: async (name: string) => { calls.push(`play ${name}`) }
  }
  const wait = async (seconds: number) => {
    calls.push(`wait ${seconds}`)
  }
  await followPlan(actor, { points: [BIN, DESK], then: 'sweep', stopSeconds: 2 }, wait)
  assert.deepEqual(calls, ['walk 4,2 1,2', 'wait 2', 'play sweep'])
})

test('a plan with no points and nothing after it does nothing; a plan that stands by does not play a gesture', async () => {
  const calls: string[] = []
  const actor = {
    walk: async () => { calls.push('walk') },
    play: async () => { calls.push('play') }
  }
  await followPlan(actor, { points: [], then: 'none' })
  await followPlan(actor, { points: [DESK], then: 'stand' })
  assert.deepEqual(calls, ['walk'])
})
