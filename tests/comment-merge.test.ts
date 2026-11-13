// Joining the window a permalink opened with the comments loaded before or after it: in order, no comment twice.
// Pure. Written, not run yet. Run: node --import tsx --test tests/comment-merge.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeCommentPages } from '../app/utils/commentMerge.ts'

const c = (id: string) => ({ id })
const ids = (rows: { id: string }[]) => rows.map(row => row.id)

test('earlier comments come before the window, in order', () => {
  const merged = mergeCommentPages([c('c1'), c('c2')], [c('c3'), c('c4')])
  assert.deepEqual(ids(merged), ['c1', 'c2', 'c3', 'c4'])
})

test('a comment that is in both pages is kept once, at its first place', () => {
  const merged = mergeCommentPages([c('c1'), c('c2')], [c('c2'), c('c3')])
  assert.deepEqual(ids(merged), ['c1', 'c2', 'c3'])
})

test('an empty page leaves the other as it was', () => {
  assert.deepEqual(ids(mergeCommentPages([], [c('c5')])), ['c5'])
  assert.deepEqual(ids(mergeCommentPages([c('c5')], [])), ['c5'])
  assert.deepEqual(ids(mergeCommentPages([], [])), [])
})
