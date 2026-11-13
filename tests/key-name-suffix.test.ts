// The stored key-name suffix (owner and Boss, 2026-11-13, card mwepy5fzg2i0jdvue7): a new key gets the plain slug or the
// next free -N and keeps it; revoking the first of two colliding keys leaves the second's name and variable unchanged;
// a suffix still held by a key is not reused; existing keys without a stored suffix get one on first display, oldest
// first. Pure. Run:
//   node --import tsx --test tests/key-name-suffix.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backfillSuffixes, nextKeySuffix } from '../shared/utils/keyNameSuffix'
import { projectServerName, projectVariableName } from '../app/utils/agentConfig'

test('a new key gets the plain slug when none holds it, and the next free -N when one does', () => {
  assert.equal(nextKeySuffix('Wren Worker', []), '')
  assert.equal(nextKeySuffix('wren-worker', [{ name: 'Wren Worker', suffix: '' }]), '-2')
  assert.equal(nextKeySuffix('WREN WORKER', [{ name: 'Wren Worker', suffix: '' }, { name: 'wren-worker', suffix: '-2' }]), '-3')
})

test('a suffix still held by a key is not reused, even after the key that had the plain slug is gone', () => {
  // The first key (plain slug) was revoked and its row deleted. The -2 key still holds -2, so the new key takes -3.
  assert.equal(nextKeySuffix('wren worker', [{ name: 'wren-worker', suffix: '-2' }]), '-3')
  assert.equal(nextKeySuffix('Other key', [{ name: 'wren-worker', suffix: '-2' }]), '', 'another slug is not affected')
})

test('revoking the first of two colliding keys leaves the second key with its stored name and variable', () => {
  const second = { id: 'b', name: 'wren-worker', createdAt: 2, suffix: '-2' as string | null }
  // The first key's row is gone. The second's stored suffix is not recomputed, so nothing is written for it.
  assert.deepEqual(backfillSuffixes([second]), {}, 'a stored suffix is never changed')
  assert.equal(projectServerName('wren-worker', '-2'), 'taskmanager-wren-worker-2')
  assert.equal(projectVariableName('wren-worker', '-2'), 'TASKMANAGER_WREN_WORKER_2')
})

test('existing keys with no stored suffix get one on first display, oldest first, and they do not collide', () => {
  const rows = [
    { id: 'b', name: 'wren-worker', createdAt: 2, suffix: null as string | null },
    { id: 'a', name: 'Wren Worker', createdAt: 1, suffix: null as string | null },
    { id: 'c', name: 'Other', createdAt: 3, suffix: null as string | null }
  ]
  assert.deepEqual(backfillSuffixes(rows), { a: '', b: '-2', c: '' })
  // The same answer whatever the order of the rows.
  assert.deepEqual(backfillSuffixes([...rows].reverse()), { a: '', b: '-2', c: '' })
})

test('backfill counts the stored suffixes that already exist, so it never repeats one', () => {
  const rows = [
    { id: 'x', name: 'Wren Worker', createdAt: 1, suffix: '' as string | null },
    { id: 'y', name: 'wren-worker', createdAt: 2, suffix: '-2' as string | null },
    { id: 'z', name: 'WREN WORKER', createdAt: 3, suffix: null as string | null }
  ]
  assert.deepEqual(backfillSuffixes(rows), { z: '-3' })
})
