// The Inbox keeps the comment in the address after the card jumps to it (mwgheoriks1kv3yed0l): the panel scrolls to the reply
// and highlights it, and the address still names the comment, so a reload or a shared copy of the link jumps again. The
// comment is taken out of the query only by the panel's own "used once" step, which this test forbids for the Inbox form.
// Source checks, as the other shell tests are. Run: node --import tsx --test tests/inbox-comment-url.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const comments = readFileSync(new URL('../app/components/kanban/TaskComments.vue', import.meta.url), 'utf8')

test('the panel does not take the comment out of the query after the jump', () => {
  assert.doesNotMatch(comments, /const \{ comment: _used, \.\.\.rest \} = route\.query/)
  assert.doesNotMatch(comments, /router\.replace\(\{ query: rest \}\)/)
})

test('the jump is still once per task and comment, so a realtime refresh does not drag the reader back', () => {
  assert.match(comments, /const key = `\$\{taskId\}:\$\{commentId\}`/)
  assert.match(comments, /if \(!commentId \|\| key === handled\) return/)
})
