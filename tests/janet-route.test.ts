// Tests for Janet Janitor's route on master's registry: the walk-in from the delivery door for a ready card, the stand and
// the sweep at the worker's desk, the badge of what she cleaned, and the single registration under 'janet'. Needs no
// database. Run: node --import tsx --test tests/janet-route.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { routes } from '../app/office/actor'
import type { P } from '../app/office/layout'
import { ARRIVE_SECONDS, JANITOR_DOOR, SWEEP_SECONDS } from '../app/office/roles/janet'

const DESK: P = { x: 2, z: -6 }
routes.setDeskLookup(personKey => (personKey === 'wynn' ? DESK : null))

const ready = { tags: ['ready to clean'], worker: 'wynn' }
const planned = { tags: ['ready to clean', 'clean plan'], worker: 'wynn' }
const granted = { tags: ['ready to clean', 'clean plan', 'cleaning granted'], worker: 'wynn' }

test('janet is registered once, under her crew key', () => {
  assert.equal(routes.keys().filter(key => key === 'janet').length, 1)
  assert.throws(() => routes.register('janet', { stateOf: () => null, plan: () => null }), /already registered/)
})

test('no cleanup tags, or a cleaned card, gives no plan', () => {
  assert.equal(routes.planFor('janet', { tags: [], worker: 'wynn' }), null)
  assert.equal(routes.planFor('janet', { tags: ['ready to clean', 'cleaned'], worker: 'wynn' }), null)
})

test('a ready card: a walk in at the delivery door, to the desk, a short stop, then nothing more', () => {
  assert.deepEqual(routes.planFor('janet', ready), { points: [JANITOR_DOOR, DESK], then: 'none', stopSeconds: ARRIVE_SECONDS })
})

test('a waiting plan: she stands at the desk', () => {
  assert.deepEqual(routes.planFor('janet', planned), { points: [DESK], then: 'stand' })
})

test('a granted cleanup: she walks to the desk and sweeps there for the sweep stop', () => {
  assert.deepEqual(routes.planFor('janet', granted), { points: [DESK], then: 'sweep', stopSeconds: SWEEP_SECONDS })
})

test('the walk-in comes through the delivery door, just inside the room', () => {
  assert.ok(JANITOR_DOOR.x < 17 && JANITOR_DOOR.x > 15, 'the door is on the right wall, inside')
  assert.equal(JANITOR_DOOR.z, 9.6)
})

test('the badge is what she cleaned since the office last looked: shown when it is above zero, on every walk', () => {
  assert.equal(routes.planFor('janet', { ...ready, cleanedSinceLook: 3 })?.badge, 3)
  assert.equal(routes.planFor('janet', { ...planned, cleanedSinceLook: 3 })?.badge, 3)
  assert.equal(routes.planFor('janet', { ...granted, cleanedSinceLook: 3 })?.badge, 3)
  assert.equal(routes.planFor('janet', { ...ready, cleanedSinceLook: 0 })?.badge, undefined)
  assert.equal(routes.planFor('janet', ready)?.badge, undefined)
})

test('no desk for the worker, no plan: the office has nowhere to send her', () => {
  assert.equal(routes.planFor('janet', { tags: ['ready to clean'], worker: 'nobody' }), null)
  assert.equal(routes.planFor('janet', { tags: ['ready to clean', 'clean plan', 'cleaning granted'], worker: 'nobody' }), null)
  assert.equal(routes.planFor('janet', { tags: ['ready to clean', 'clean plan'], worker: 'nobody' }), null)
})
