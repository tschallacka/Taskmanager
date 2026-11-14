// The board's view row (app/utils/projectViews.ts): the four pages Overview, Messages, Time and Files sit under "More", as
// the owner's design (page06) says. Nothing is removed: every view is either a tab or a More item, in its order. Pure: no
// DOM. Run: node --import tsx --test tests/project-views.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitProjectViews } from '../app/utils/projectViews'

const ALL = ['overview', 'board', 'office', 'list', 'timeline', 'calendar', 'dashboard', 'messages', 'time', 'files', 'settings']
  .map(key => ({ key }))

test('the four More pages are Overview, Messages, Time and Files, in that order; the rest stay as tabs', () => {
  const { primary, more } = splitProjectViews(ALL)
  assert.deepEqual(more.map(v => v.key), ['overview', 'messages', 'time', 'files'])
  assert.deepEqual(primary.map(v => v.key), ['board', 'office', 'list', 'timeline', 'calendar', 'dashboard', 'settings'])
})

test('nothing is lost: every view is a tab or a More item, once', () => {
  const { primary, more } = splitProjectViews(ALL)
  const keys = [...primary, ...more].map(v => v.key).sort()
  assert.deepEqual(keys, ALL.map(v => v.key).sort())
})

test('a view the split does not know stays a tab, so a new page is never hidden', () => {
  const { primary, more } = splitProjectViews([{ key: 'board' }, { key: 'reports' }, { key: 'files' }])
  assert.deepEqual(primary.map(v => v.key), ['board', 'reports'])
  assert.deepEqual(more.map(v => v.key), ['files'])
})

test('a board without any More page has no More group', () => {
  const { primary, more } = splitProjectViews([{ key: 'board' }, { key: 'list' }])
  assert.deepEqual(primary.map(v => v.key), ['board', 'list'])
  assert.deepEqual(more, [])
})
