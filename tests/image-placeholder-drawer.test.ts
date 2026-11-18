// The task drawer and the placeholders (source level): the description is saved with the pending placeholders taken out, and a save
// coming back from the server does not reset the editor while an upload is still in its text.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the description is saved without the pending placeholders, and the saved copy is remembered as our own', () => {
  const drawer = read('app/components/kanban/TaskDrawer.vue')
  assert.match(drawer, /const html = stripPendingPlaceholders\(editorContent\.value\)/)
  assert.match(drawer, /ownSaves\.push\(html\)/)
  assert.match(drawer, /updateTask\(taskId, \{ description: html \}\)/)
})

test('a server copy goes through shouldAdoptServerDescription, so a late answer or a pending upload does not reset the editor', () => {
  const drawer = read('app/components/kanban/TaskDrawer.vue')
  assert.match(drawer, /if \(!shouldAdoptServerDescription\(description, editorContent\.value, ownSaves\)\) return/)
})

test('the drawer uses the placeholder helpers from the editor folder', () => {
  const drawer = read('app/components/kanban/TaskDrawer.vue')
  assert.match(drawer, /import \{ shouldAdoptServerDescription, stripPendingPlaceholders \} from '~\/utils\/editor\/imagePlaceholders'/)
})
