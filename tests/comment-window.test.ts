// A permalink opens a window of a task's comments: 5 before and 5 after the comment, with counts of what is left, and
// "load earlier" / "show later" load all of one side. The window is counted over the rows the reader may see, so a
// customer's window counts only shared comments (the rows passed in are already filtered). Unknown or hidden ids give
// 404. Pure tests, no database; the HTTP route needs the database harness and is not in this file. Written, not run yet.
// Run: node --import tsx --test tests/comment-window.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createError } from 'h3'
import { aroundComment, allEarlierThan, allLaterThan, WINDOW_SIDE } from '../server/utils/commentWindow.ts'

Object.assign(globalThis, { createError })

// A thread of n comments, oldest first, ids c1..cn.
function thread(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, createdAt: 1000 + i }))
}
const ids = (rows: { id: string }[]) => rows.map(row => row.id)

test('the window is the comment with 5 before and 5 after it', () => {
  const rows = thread(30)
  const w = aroundComment(rows, 'c15')
  assert.equal(WINDOW_SIDE, 5)
  assert.deepEqual(ids(w.comments), ['c10', 'c11', 'c12', 'c13', 'c14', 'c15', 'c16', 'c17', 'c18', 'c19', 'c20'])
  assert.equal(w.hasEarlier, true)
  assert.equal(w.earlierCount, 9)
  assert.equal(w.hasLater, true)
  assert.equal(w.laterCount, 10)
})

test('at the start of a thread there is nothing earlier, and at most 5 after', () => {
  const rows = thread(30)
  const w = aroundComment(rows, 'c1')
  assert.deepEqual(ids(w.comments), ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])
  assert.equal(w.hasEarlier, false)
  assert.equal(w.earlierCount, 0)
  assert.equal(w.hasLater, true)
  assert.equal(w.laterCount, 24)
})

test('at the end of a thread there is nothing later, and at most 5 before', () => {
  const rows = thread(30)
  const w = aroundComment(rows, 'c30')
  assert.deepEqual(ids(w.comments), ['c25', 'c26', 'c27', 'c28', 'c29', 'c30'])
  assert.equal(w.hasLater, false)
  assert.equal(w.laterCount, 0)
  assert.equal(w.hasEarlier, true)
  assert.equal(w.earlierCount, 24)
})

test('a short thread is shown whole, with nothing left on either side', () => {
  const rows = thread(3)
  const w = aroundComment(rows, 'c2')
  assert.deepEqual(ids(w.comments), ['c1', 'c2', 'c3'])
  assert.equal(w.hasEarlier, false)
  assert.equal(w.hasLater, false)
})

test('load earlier loads every comment before the given one, and nothing after it', () => {
  const rows = thread(30)
  const w = allEarlierThan(rows, 'c10')
  assert.equal(w.comments.length, 9)
  assert.equal(w.comments[0]!.id, 'c1')
  assert.equal(w.comments.at(-1)!.id, 'c9')
  assert.equal(w.hasEarlier, false)
  assert.equal(w.hasLater, true)
  assert.equal(w.laterCount, 21)
})

test('show later loads every comment after the given one, and nothing before it', () => {
  const rows = thread(30)
  const w = allLaterThan(rows, 'c20')
  assert.equal(w.comments.length, 10)
  assert.equal(w.comments[0]!.id, 'c21')
  assert.equal(w.comments.at(-1)!.id, 'c30')
  assert.equal(w.hasLater, false)
  assert.equal(w.laterCount, 0)
  assert.equal(w.hasEarlier, true)
  assert.equal(w.earlierCount, 20)
})

test('the window counts only the comments the reader may see: a customer gets shared comments only', () => {
  // The route filters the thread by visibility first; a customer's window is taken from those rows alone.
  const all = thread(40)
  const sharedOnly = all.filter((_, i) => i % 2 === 0)
  const w = aroundComment(sharedOnly, 'c21')
  assert.deepEqual(ids(w.comments), ['c11', 'c13', 'c15', 'c17', 'c19', 'c21', 'c23', 'c25', 'c27', 'c29', 'c31'])
  assert.equal(w.earlierCount, 5)
  assert.equal(w.laterCount, 4)
})

test('an unknown or hidden comment id is a 404', () => {
  const rows = thread(5)
  for (const make of [aroundComment, allEarlierThan, allLaterThan]) {
    assert.throws(() => make(rows, 'not-a-comment'), (e: { statusCode?: number }) => e.statusCode === 404)
  }
})
