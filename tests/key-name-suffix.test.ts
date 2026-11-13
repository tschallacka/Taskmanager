// The stored key-name suffix (owner and Boss, 2026-11-13, card mwepy5fzg2i0jdvue7): a new key gets the plain slug or the
// next free -N and keeps it; revoking the first of two colliding keys leaves the second's name and variable unchanged;
// a suffix still held by a key is not reused; existing keys without a stored suffix get one on first display, oldest
// first, and a stored suffix survives the next list call. The rows are built with the schema's own field names (nameSuffix,
// nameSlug, ...), the same shape the database returns. Pure. Run:
//   node --import tsx --test tests/key-name-suffix.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backfillSuffixes, nextKeySuffix, type SuffixRow } from '../shared/utils/keyNameSuffix'
import { projectServerName, projectVariableName } from '../app/utils/agentConfig'

// A key row with every column the schema has (api_keys), so the tests read the real shape.
function keyRow(overrides: Partial<SuffixRow> & { id: string, name: string, createdAt: number }) {
  return {
    id: overrides.id,
    userId: 'user-1',
    teamId: null,
    customerId: null,
    projectId: null,
    name: overrides.name,
    keyHash: `hash-${overrides.id}`,
    keyPrefix: 'arn_abcd',
    scopes: ['boards:read'],
    lastUsedAt: null,
    expiresAt: null,
    createdAt: overrides.createdAt,
    allBoards: false,
    boardReachSet: true,
    kind: 'access' as const,
    boardScopesSet: false,
    nameSuffix: overrides.nameSuffix ?? null,
    nameSlug: overrides.nameSlug ?? null
  }
}

test('a new key gets the plain slug when none holds it, and the next free -N when one does', () => {
  assert.equal(nextKeySuffix('Wren Worker', []), '')
  assert.equal(nextKeySuffix('wren-worker', [{ name: 'Wren Worker', nameSuffix: '' }]), '-2')
  assert.equal(nextKeySuffix('WREN WORKER', [{ name: 'Wren Worker', nameSuffix: '' }, { name: 'wren-worker', nameSuffix: '-2' }]), '-3')
})

test('a suffix still held by a key is not reused, even after the key that had the plain slug is gone', () => {
  assert.equal(nextKeySuffix('wren worker', [{ name: 'wren-worker', nameSuffix: '-2' }]), '-3')
  assert.equal(nextKeySuffix('Other key', [{ name: 'wren-worker', nameSuffix: '-2' }]), '', 'another slug is not affected')
})

test('revoking the first of two colliding keys leaves the second with its stored name and variable', () => {
  const second = keyRow({ id: 'b', name: 'wren-worker', createdAt: 2, nameSuffix: '-2', nameSlug: 'wren-worker' })
  // The first key's row is gone. The second has a stored suffix, so nothing is computed or written for it.
  assert.deepEqual(backfillSuffixes([second]), {}, 'a stored suffix is never changed')
  assert.equal(projectServerName('wren-worker', second.nameSuffix ?? ''), 'taskmanager-wren-worker-2')
  assert.equal(projectVariableName('wren-worker', second.nameSuffix ?? ''), 'TASKMANAGER_WREN_WORKER_2')
})

test('existing keys with no stored suffix get one on first display, oldest first, whatever the row order', () => {
  const rows = [
    keyRow({ id: 'b', name: 'wren-worker', createdAt: 2 }),
    keyRow({ id: 'a', name: 'Wren Worker', createdAt: 1 }),
    keyRow({ id: 'c', name: 'Other', createdAt: 3 })
  ]
  assert.deepEqual(backfillSuffixes(rows), { a: '', b: '-2', c: '' })
  assert.deepEqual(backfillSuffixes([...rows].reverse()), { a: '', b: '-2', c: '' })
})

test('backfill counts the stored suffixes that already exist, so it never repeats one', () => {
  const rows = [
    keyRow({ id: 'x', name: 'Wren Worker', createdAt: 1, nameSuffix: '' }),
    keyRow({ id: 'y', name: 'wren-worker', createdAt: 2, nameSuffix: '-2' }),
    keyRow({ id: 'z', name: 'WREN WORKER', createdAt: 3 })
  ]
  assert.deepEqual(backfillSuffixes(rows), { z: '-3' })
})

test('a stored suffix survives the next list call: the second call computes nothing and changes nothing', () => {
  const before = [
    keyRow({ id: 'a', name: 'Wren Worker', createdAt: 1 }),
    keyRow({ id: 'b', name: 'wren-worker', createdAt: 2 })
  ]
  // First list call: compute the values, store them on the rows (what the list endpoint does with the update).
  const first = backfillSuffixes(before)
  assert.deepEqual(first, { a: '', b: '-2' })
  const stored = before.map(row => ({ ...row, nameSuffix: first[row.id] ?? row.nameSuffix }))
  // Second list call: the rows now carry their stored suffixes, so nothing is recomputed.
  assert.deepEqual(backfillSuffixes(stored), {}, 'no recomputation on the second call')
  assert.equal(stored.find(row => row.id === 'b')?.nameSuffix, '-2', 'the stored suffix is still -2')
})
