// The invite page shows a loading line at once while the invitation loads (Usher's C: a blank wait on a cold start). The
// line sits with the spinner in the same block, so there is no empty card while the request is in flight. Source level.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../app/pages/invite/[token].vue', import.meta.url), 'utf8')

test('the loading block names what it is loading', () => {
  const block = page.slice(page.indexOf('v-if="pending || sessionPending"'), page.indexOf('v-else-if="loadMessage"'))
  assert.match(block, /Loading/)
})

test('the invitation is not awaited at setup, so the page renders (and the loading line shows) before the fetch ends', () => {
  // An awaited useFetch in <script setup> suspends the whole page: nothing is drawn until the request ends (the bug).
  assert.equal(/await useFetch/.test(page), false)
})

test('the loading line is not behind a timer, so it shows on the first paint', () => {
  const block = page.slice(page.indexOf('v-if="pending || sessionPending"'), page.indexOf('v-else-if="loadMessage"'))
  assert.equal(/setTimeout|delay|debounce/i.test(block), false)
})
