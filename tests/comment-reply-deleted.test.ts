// The reply quote after its parent is deleted (card mwqc664ygytkxv679df): the open drawer must show the same line as a reload, "In reply to a
// deleted update", without a reload. markReplyParentsDeleted marks each reply whose parent was deleted; replyLineText then gives that line.
// The store's deleteComment uses it, which the source check below reads.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { markReplyParentsDeleted, replyLineText } from '../app/utils/taskComments'

type Row = { id: string, replyTo: { id: string | null, authorName: string | null, excerpt: string, deleted: boolean } | null }

const thread = (): Row[] => [
  { id: 'a', replyTo: null },
  { id: 'b', replyTo: { id: 'a', authorName: 'Usher Admin', excerpt: 'first update edited once', deleted: false } },
  { id: 'c', replyTo: { id: 'z', authorName: 'Other', excerpt: 'unrelated', deleted: false } }
]

test('deleting the parent marks its reply: the quote reads "In reply to a deleted update"', () => {
  const after = markReplyParentsDeleted(thread(), 'a')
  const reply = after.find(c => c.id === 'b')!
  assert.equal(reply.replyTo?.deleted, true)
  assert.equal(replyLineText(reply.replyTo), 'In reply to a deleted update')
})

test('replies to other comments are not touched, and the deleted comment itself is not in the thread', () => {
  const after = markReplyParentsDeleted(thread(), 'a')
  assert.deepEqual(after.find(c => c.id === 'c')?.replyTo, { id: 'z', authorName: 'Other', excerpt: 'unrelated', deleted: false })
})

test('a thread with no reply to the deleted comment is returned unchanged', () => {
  assert.deepEqual(markReplyParentsDeleted(thread(), 'nope'), thread())
})

test('the store marks the replies when a comment is deleted (source level)', () => {
  const store = readFileSync(new URL('../app/composables/useProjects.ts', import.meta.url), 'utf8')
  const start = store.indexOf('async function deleteComment(taskId: string, commentId: string)')
  assert.ok(start >= 0)
  const body = store.slice(start, store.indexOf('function clearComments()', start))
  assert.match(body, /markReplyParentsDeleted\(_comments\.value, commentId\)/)
})
