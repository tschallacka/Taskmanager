// Archive all under the Unread filter, page side: the page asks for the unread rows only, the request says so, and the rows
// the list keeps are the read ones the filter does not show (Nina's CQ: the page half had no test). Pure: the helper the
// page and the composable both use, so the behaviour is tested without the page. Run:
//   node --import tsx --test tests/notifications-unread-archive-page.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { archiveAllRequest, keptAfterArchiveAll } from '../app/utils/notificationArchive'

const items = [
  { id: 'unread-1', readAt: null },
  { id: 'read-1', readAt: 1000 },
  { id: 'unread-2', readAt: null },
  { id: 'read-2', readAt: 2000 }
]

test('under the Unread filter, Archive all asks the server for the unread rows only', () => {
  assert.deepEqual(archiveAllRequest('unread'), { all: true, unreadOnly: true })
})

test('under All or Read box, Archive all takes every inbox row (unchanged)', () => {
  assert.deepEqual(archiveAllRequest('all'), { all: true, unreadOnly: false })
  assert.deepEqual(archiveAllRequest('readbox'), { all: true, unreadOnly: false })
})

test('under the Unread filter the list keeps the read rows, which the filter does not show', () => {
  assert.deepEqual(keptAfterArchiveAll(items, true).map(item => item.id), ['read-1', 'read-2'])
})

test('under All the list keeps nothing (every row is archived)', () => {
  assert.deepEqual(keptAfterArchiveAll(items, false), [])
})

test('the page passes the Unread filter to archiveAll, so the request follows from the filter', () => {
  const page = readFileSync(new URL('../app/pages/projects/inbox.vue', import.meta.url), 'utf8')
  assert.match(page, /archiveAll\(filter\.value === 'unread'\)/)
})
