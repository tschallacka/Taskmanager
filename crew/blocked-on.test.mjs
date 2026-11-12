// The BLOCKED ON line (crew/blocked-on.mjs): the newest line names the key and the need, a line that is not the first line
// or has no key does not count, and a Blocked card without one is a finding; a card in another column is not.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blockedOnOf, blockedWithoutLine } from './blocked-on.mjs'

test('the newest BLOCKED ON line names the key and what is needed', () => {
  const updates = [
    { body: 'BLOCKED ON boss: push actor_id to arnotes_test_wynn' },
    { body: 'BLOCKED ON susy: an older line' }
  ]
  assert.deepEqual(blockedOnOf(updates), { key: 'boss', need: 'push actor_id to arnotes_test_wynn' })
})

test('a line that is not the first line of an update, or has no key, does not count', () => {
  assert.equal(blockedOnOf([{ body: 'Some text\nBLOCKED ON boss: decision X' }]), null)
  assert.equal(blockedOnOf([{ body: 'BLOCKED ON: no key' }]), null)
  assert.equal(blockedOnOf([]), null)
  assert.equal(blockedOnOf(undefined), null)
})

test('a Blocked card with no BLOCKED ON line is a finding; a card elsewhere, or with a line, is not', () => {
  const cards = [
    { id: 'c1', column: 'Blocked', updates: [{ body: 'waiting' }] },
    { id: 'c2', column: 'Blocked', updates: [{ body: 'BLOCKED ON boss: decision X' }] },
    { id: 'c3', column: 'To do', updates: [] }
  ]
  assert.deepEqual(blockedWithoutLine(cards), [{ id: 'c1', column: 'Blocked' }])
})
