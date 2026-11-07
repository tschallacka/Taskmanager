// The subtask list's lock rule: a customer contact is locked by the drawer, a read-only crew board locks the list for
// its staff and says why, and a writable board locks nothing. The repo has no component test runner, so the rule is
// tested here, and SubtaskList.vue uses the same function.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { subtaskLockState } from '../app/utils/subtaskLock'

test('a writable board for staff is not locked and shows no note', () => {
  assert.deepEqual(subtaskLockState({ customerReadonly: false, boardReadOnly: false }), { locked: false, boardNote: false })
})

test('a read-only crew board locks the list for its staff and says why', () => {
  assert.deepEqual(subtaskLockState({ customerReadonly: false, boardReadOnly: true }), { locked: true, boardNote: true })
})

test('a customer contact is locked by the drawer and gets no note about the board, even on a read-only board', () => {
  assert.deepEqual(subtaskLockState({ customerReadonly: true, boardReadOnly: false }), { locked: true, boardNote: false })
  assert.deepEqual(subtaskLockState({ customerReadonly: true, boardReadOnly: true }), { locked: true, boardNote: false })
})
