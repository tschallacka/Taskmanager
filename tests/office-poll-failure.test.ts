// The office page: a board the viewer cannot see gets no room at all (the 404 has no reason), a board with no
// crew says so (a 404 with reason "no-crew"), and anything else is a retry. Pure; needs no browser. Run:
//   node --import tsx --test tests/office-poll-failure.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pollFailureOf } from '../app/office/pollFailure'

test('a 404 without a reason is a board the viewer cannot see, so no room is shown', () => {
  assert.deepEqual(pollFailureOf({ statusCode: 404, statusMessage: 'Not Found' }), { kind: 'unseen' })
  assert.deepEqual(pollFailureOf({ statusCode: 404, data: {} }), { kind: 'unseen' })
})

test('a 404 with the no-crew reason says that no crew works on the board', () => {
  assert.deepEqual(pollFailureOf({ statusCode: 404, data: { data: { reason: 'no-crew' } } }), { kind: 'no-crew' })
})

test('the no-crew reason wins over the 404 it comes with', () => {
  assert.equal(pollFailureOf({ statusCode: 404, data: { data: { reason: 'no-crew' } } }).kind, 'no-crew')
})

test('a server error, a dropped connection or nothing at all is a retry, never an unseen board', () => {
  assert.deepEqual(pollFailureOf({ statusCode: 500 }), { kind: 'retry' })
  assert.deepEqual(pollFailureOf(new TypeError('fetch failed')), { kind: 'retry' })
  assert.deepEqual(pollFailureOf(undefined), { kind: 'retry' })
  assert.deepEqual(pollFailureOf(null), { kind: 'retry' })
})
