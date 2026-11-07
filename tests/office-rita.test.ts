// Rita Reporter's piece of the route registry: she types at her typewriter while a report is due or minutes are owed.
// Needs the repository's three.js (CI has it); the registry is the office's own.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routes } from '../app/office/actor'
import { MEETING_OVER, STATUS_EVERY_MS, TYPEWRITER, closesMeeting, statusDue } from '../app/office/roles/rita'

test('a status report is due once an hour, or before the first one', () => {
  const now = 10 * STATUS_EVERY_MS
  assert.equal(statusDue(null, now), true, 'no report yet')
  assert.equal(statusDue(now - STATUS_EVERY_MS + 1, now), false, 'one millisecond short of an hour is not due')
  assert.equal(statusDue(now - STATUS_EVERY_MS, now), true, 'an hour since the last report is due')
})

test('minutes are owed from a line that says "meeting over:", in any case', () => {
  assert.equal(MEETING_OVER, 'meeting over:')
  assert.equal(closesMeeting('Meeting Over: ship it'), true)
  assert.equal(closesMeeting('we will meet later'), false)
})

test('Rita is registered under her key; she types while minutes are owed, with the count as badge', () => {
  const now = 10 * STATUS_EVERY_MS
  assert.ok(routes.keys().includes('rita'), 'rita is registered')
  assert.deepEqual(routes.planFor('rita', { lastReportAt: now - 1000, minutesOwed: 2, now }), {
    points: [TYPEWRITER], then: 'stand', badge: 2
  })
})

test('Rita types when a report is due, with no badge, and is off duty otherwise', () => {
  const now = 10 * STATUS_EVERY_MS
  assert.deepEqual(routes.planFor('rita', { lastReportAt: now - STATUS_EVERY_MS, minutesOwed: 0, now }), {
    points: [TYPEWRITER], then: 'stand'
  })
  assert.equal(routes.planFor('rita', { lastReportAt: now - 1000, minutesOwed: 0, now }), null)
})
