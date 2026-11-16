// The task drawer and the placeholders (source level): the description is saved with the pending placeholders taken out, and a save
// coming back from the server does not reset the editor while an upload is still in its text.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the description is saved without the pending placeholders', () => {
  const drawer = read('app/components/kanban/TaskDrawer.vue')
  assert.match(drawer, /description: stripPendingPlaceholders\(editorContent\.value\)/)
})

test('a save echo from the server does not reset the editor over a pending placeholder', () => {
  const drawer = read('app/components/kanban/TaskDrawer.vue')
  assert.match(drawer, /if \(description === stripPendingPlaceholders\(editorContent\.value\)\) return/)
})

test('the drawer uses the placeholder helpers from the editor folder', () => {
  const drawer = read('app/components/kanban/TaskDrawer.vue')
  assert.match(drawer, /import \{ stripPendingPlaceholders \} from '~\/utils\/editor\/imagePlaceholders'/)
})
