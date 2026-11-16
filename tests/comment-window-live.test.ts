// The comment window's two rules the comments store and the thread use, as pure functions:
//   applyLiveComment: a comment that arrives while a permalink's window is shown joins the window only when the later
//     side is fully loaded; otherwise the Show later count goes up.
//   activityInWindow: activity lines show only between the first and last shown comment times; the whole thread shows all.
// Run: node --import tsx --test tests/comment-window-live.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activityInWindow, applyLiveComment } from '../app/utils/commentWindowLive'

const c = (id: string, createdAt: number) => ({ id, createdAt })

test('a live comment in a windowed thread with the later side loaded is added at the end', () => {
  const r = applyLiveComment([c('a', 1), c('b', 2)], { hasLater: false, laterCount: 0 }, c('n', 3))
  assert.deepEqual(r.comments.map(x => x.id), ['a', 'b', 'n'])
  assert.deepEqual(r.state, { hasLater: false, laterCount: 0 })
})

test('a live comment while the later side is not loaded only raises the Show later count', () => {
  const r = applyLiveComment([c('a', 1)], { hasLater: true, laterCount: 4 }, c('n', 3))
  assert.deepEqual(r.comments.map(x => x.id), ['a'])
  assert.deepEqual(r.state, { hasLater: true, laterCount: 5 })
})

test('a live comment already in the window is not added twice and does not count', () => {
  const r = applyLiveComment([c('a', 1)], { hasLater: false, laterCount: 0 }, c('a', 1))
  assert.deepEqual(r.comments.map(x => x.id), ['a'])
  assert.deepEqual(r.state, { hasLater: false, laterCount: 0 })
})

test('activity shows only between the first and last shown comment times', () => {
  const activity = [{ id: 'x', createdAt: 0 }, { id: 'y', createdAt: 2 }, { id: 'z', createdAt: 5 }, { id: 'w', createdAt: 9 }]
  const shown = activityInWindow(activity, [c('a', 1), c('b', 4)], { hasEarlier: true, hasLater: true })
  assert.deepEqual(shown.map(x => x.id), ['y'])
})

test('with the whole thread shown, or no window at all, all activity shows', () => {
  const activity = [{ id: 'x', createdAt: 0 }, { id: 'y', createdAt: 9 }]
  assert.deepEqual(activityInWindow(activity, [c('a', 1)], { hasEarlier: false, hasLater: false }).map(x => x.id), ['x', 'y'])
  assert.deepEqual(activityInWindow(activity, [c('a', 1)], null).map(x => x.id), ['x', 'y'])
})

test('a window with no comments shown shows no activity', () => {
  const activity = [{ id: 'x', createdAt: 0 }]
  assert.deepEqual(activityInWindow(activity, [], { hasEarlier: true, hasLater: false }), [])
})
