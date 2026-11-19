// The image upload reports progress (source level): the task drawer's uploader sends the file with XMLHttpRequest, so the upload's own
// progress reaches the placeholder; when the length is unknown it reports null (an indeterminate bar). A failure rejects with the reason.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the upload uses XMLHttpRequest, so its progress can be read', () => {
  const drawer = read('app/components/kanban/TaskDrawer.vue')
  const fn = drawer.slice(drawer.indexOf('async function uploadImage'), drawer.indexOf('async function uploadImage') + 1400)
  assert.match(fn, /new XMLHttpRequest\(\)/)
  assert.match(fn, /xhr\.upload\.onprogress/)
})

test('progress is the fraction loaded, or null when the length is not known', () => {
  const drawer = read('app/components/kanban/TaskDrawer.vue')
  const fn = drawer.slice(drawer.indexOf('async function uploadImage'), drawer.indexOf('async function uploadImage') + 1400)
  assert.match(fn, /e\.lengthComputable \? e\.loaded \/ e\.total : null/)
})

test('a failed upload rejects with the server reason', () => {
  const drawer = read('app/components/kanban/TaskDrawer.vue')
  const fn = drawer.slice(drawer.indexOf('async function uploadImage'), drawer.indexOf('async function uploadImage') + 1400)
  assert.match(fn, /reject\(new Error\(/)
  assert.match(fn, /body\.message/)
})
