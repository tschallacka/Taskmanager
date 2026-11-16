// The projects page while the list loads (source level): a text line sits next to the spinner, so a blank wait reads as loading, not as an empty page.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the projects page shows a text line while the list loads', () => {
  const page = read('app/pages/projects/index.vue')
  const loading = page.slice(page.indexOf('v-if="!showEmptyState"'), page.indexOf('v-else'))
  assert.match(loading, /Opening your projects/, 'a text line is shown next to the spinner while the list loads')
  assert.match(loading, /animate-spin/, 'the spinner stays')
})
