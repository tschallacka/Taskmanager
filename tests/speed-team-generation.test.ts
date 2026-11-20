// Speed, Nina's SHOULD 3 (card mwibpggp): a team switch must not let a task request that started before it write the old team's rows
// into the store. createGeneration gives each request a token; a team switch bumps the generation, and a token from before the bump
// is no longer current. The store checks its token before it applies an answer (useProjects.ts), and the source check below reads
// the store to confirm it does.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createGeneration } from '../app/utils/requestGeneration'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('a request started in the current generation is current until the generation moves on', () => {
  const gen = createGeneration()
  const token = gen.begin()
  assert.equal(token.isCurrent(), true)
})

test('a team switch (bump) makes every request started before it stale', () => {
  const gen = createGeneration()
  const before = gen.begin()
  gen.bump()
  assert.equal(before.isCurrent(), false, 'the old team\'s answer is dropped')
})

test('a request started after the switch is current, and a second switch makes it stale too', () => {
  const gen = createGeneration()
  gen.bump()
  const after = gen.begin()
  assert.equal(after.isCurrent(), true, 'the new team\'s answer is applied')
  gen.bump()
  assert.equal(after.isCurrent(), false)
})

test('the store starts requests with a token, drops stale answers, and a switch moves the generation on', () => {
  const store = read('app/composables/useProjects.ts')
  assert.match(store, /import \{ createGeneration \} from '~\/utils\/requestGeneration'/)
  assert.match(store, /const _generation = createGeneration\(\)/)
  const ensure = store.slice(store.indexOf('async function ensureTasks()'), store.indexOf('async function ensureTasks()') + 600)
  assert.match(ensure, /const token = _generation\.begin\(\)/, 'ensureTasks takes a token when it starts')
  assert.match(ensure, /if \(!token\.isCurrent\(\)\) return/, 'a stale answer is dropped before it is applied')
  const counts = store.slice(store.indexOf('async function ensureTaskCounts()'), store.indexOf('async function ensureTaskCounts()') + 600)
  assert.match(counts, /const token = _generation\.begin\(\)/)
  assert.match(counts, /if \(!token\.isCurrent\(\)\) return/)
  const sync = store.slice(store.indexOf('async function syncProjects()'), store.indexOf('async function syncProjects()') + 900)
  assert.match(sync, /token\.isCurrent\(\)/, 'a sync also drops a stale answer')
  const refresh = store.slice(store.indexOf('async function refresh()'), store.indexOf('async function refresh()') + 400)
  assert.match(refresh, /_generation\.bump\(\)/, 'a team switch moves the generation on')
  assert.match(refresh, /_tasksRequest = null/, 'a new request is not blocked by the old one')
  assert.match(refresh, /_countsRequest = null/)
  const finallies = store.match(/\.finally\(\(\) => \{ if \(_tasksRequest === request\) _tasksRequest = null \}\)/g) ?? []
  assert.ok(finallies.length >= 1, 'a finished request clears only its own pointer, so a newer request is not cleared')
})
