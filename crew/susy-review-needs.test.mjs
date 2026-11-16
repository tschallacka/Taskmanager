// Susy daemon, phase 4 (card mwf201blsqvx3jczev): one status line of the cards that wait for a human. Fake boards only.
// Run: node --test crew/susy-review-needs.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reviewNeeds, reviewLine } from './susy-review-needs.mjs'

const NOW = Date.parse('2026-11-16T12:00:00.000Z')
const HOUR = 3600000
const card = (id, column, hoursAgo, extra = {}) => ({
  id,
  title: `card ${id}`,
  column,
  tags: [],
  updatedAt: new Date(NOW - hoursAgo * HOUR).toISOString(),
  ...extra
})

test('a card in Verify waits for Boss, with how long it has waited', () => {
  const out = reviewNeeds([card('a', 'Verify', 2)], NOW)
  assert.deepEqual(out.boss.map(c => [c.id, c.hours]), [['a', 2]])
  assert.deepEqual(out.owner, [])
})

test('an open card labelled owner waits for the owner', () => {
  const out = reviewNeeds([card('b', 'In progress', 5, { tags: ['owner'] })], NOW)
  assert.deepEqual(out.owner.map(c => [c.id, c.hours]), [['b', 5]])
  assert.deepEqual(out.boss, [])
})

test('Done and Ready for live cards are not waiting', () => {
  const out = reviewNeeds([card('c', 'Done', 9, { tags: ['owner'] }), card('d', 'Ready for live', 9, { tags: ['owner'] })], NOW)
  assert.deepEqual(out.owner, [])
  assert.deepEqual(out.boss, [])
})

test('the longest wait comes first', () => {
  const out = reviewNeeds([card('a', 'Verify', 1), card('b', 'Verify', 7), card('c', 'Verify', 3)], NOW)
  assert.deepEqual(out.boss.map(c => c.id), ['b', 'c', 'a'])
})

test('nothing waiting gives an empty line', () => {
  assert.equal(reviewLine(reviewNeeds([card('a', 'To do', 1)], NOW)), '')
})

test('the line names each group with its cards and how long they wait', () => {
  const line = reviewLine(reviewNeeds([card('a', 'Verify', 2), card('b', 'Verify', 0.5), card('c', 'In progress', 5, { tags: ['owner'] })], NOW))
  assert.equal(line, 'Waiting for a human. Boss: 2 (a 2h, b 30m). Owner: 1 (c 5h).')
})

test('a line with only Boss\'s cards names only Boss', () => {
  const line = reviewLine(reviewNeeds([card('a', 'Verify', 1)], NOW))
  assert.equal(line, 'Waiting for a human. Boss: 1 (a 1h).')
})
