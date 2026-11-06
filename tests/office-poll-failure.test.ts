// The office page: a board the viewer cannot see gets no room at all (the 404 has no reason), a board with no
// crew says so (a 404 with reason "no-crew"), and anything else is a retry. Pure; needs no browser. Run:
//   node --import tsx --test tests/office-poll-failure.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pollFailureOf, unseenAfter } from '../app/office/pollFailure'

test('a 404 without a reason is a board the viewer cannot see, so no room is shown', () => {
  assert.deepEqual(pollFailureOf({ statusCode: 404, statusMessage: 'Not Found' }), { kind: 'unseen' })
  assert.deepEqual(pollFailureOf({ statusCode: 404, data: {} }), { kind: 'unseen' })
})

test('a 404 with the no-crew reason says that no crew works on the board', () => {
  assert.deepEqual(pollFailureOf({ statusCode: 404, data: { data: { reason: 'no-crew' } } }), { kind: 'no-crew' })
})

test('the no-crew reason alone, with no status code, still says that no crew works on the board', () => {
  assert.equal(pollFailureOf({ data: { data: { reason: 'no-crew' } } }).kind, 'no-crew')
})

test('a server error, a dropped connection or nothing at all is a retry, never an unseen board', () => {
  assert.deepEqual(pollFailureOf({ statusCode: 500 }), { kind: 'retry' })
  assert.deepEqual(pollFailureOf(new TypeError('fetch failed')), { kind: 'retry' })
  assert.deepEqual(pollFailureOf(undefined), { kind: 'retry' })
  assert.deepEqual(pollFailureOf(null), { kind: 'retry' })
})

test('the page takes a board away only after two unseen 404s in a row', () => {
  const first = unseenAfter(0, { kind: 'unseen' })
  assert.deepEqual(first, { strikes: 1, unseen: false })
  assert.deepEqual(unseenAfter(first.strikes, { kind: 'unseen' }), { strikes: 2, unseen: true })
})

test('a retry or a no-crew answer between two unseen 404s starts the count again', () => {
  const after = unseenAfter(unseenAfter(0, { kind: 'unseen' }).strikes, { kind: 'retry' })
  assert.deepEqual(after, { strikes: 0, unseen: false })
  assert.deepEqual(unseenAfter(after.strikes, { kind: 'unseen' }), { strikes: 1, unseen: false })
  assert.deepEqual(unseenAfter(0, { kind: 'no-crew' }), { strikes: 0, unseen: false })
})
