// The expanded API key row: a board it reaches links to that board, by name and workspace, a crew's read-only
// board is marked read-only, and the row opens to its read-only view, with the ticked boxes only in edit mode.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keyPanelMode, reachBoardLinks } from '../app/utils/apiKeyView'

test('each board a key reaches links to that board, by name and workspace, and a crew read-only board is marked', () => {
  const links = reachBoardLinks([
    { id: 'board-a', name: 'Internal Tools', workspace: 'Acme', readOnly: false },
    { id: 'board-crew', name: 'Office', workspace: 'Other team', readOnly: true }
  ])
  assert.deepEqual(links, [
    { id: 'board-a', name: 'Internal Tools', workspace: 'Acme', readOnly: false, to: '/projects/board-a' },
    { id: 'board-crew', name: 'Office', workspace: 'Other team', readOnly: true, to: '/projects/board-crew' }
  ])
})

test('a row opens to the read-only view; the edit form (ticked boxes) only once the owner asks to change the key', () => {
  const owned = { editable: true }
  assert.equal(keyPanelMode(owned, null), 'read', 'opening the row shows no form')
  assert.equal(keyPanelMode(owned, { scopes: {}, pick: {}, saving: false }), 'edit', 'the owner asked to change it')
})

test('a team key is never in edit mode in the personal list, even with an edit state', () => {
  assert.equal(keyPanelMode({ editable: false }, { scopes: {}, pick: {}, saving: false }), 'read')
})
