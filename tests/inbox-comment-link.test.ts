// The Inbox opens a comment's card scrolled to the reply: the link names the comment (taskLink), the comment id is stored on
// the notification and passed from the comment route (source checks, as the other shell tests are), and the inbox opens the
// card with that comment in its query.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { taskLink } from '../app/utils/taskLink'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('a card link names the comment when there is one, and is the plain card link otherwise', () => {
  assert.equal(taskLink('p1', 't1'), '/projects/p1?task=t1')
  assert.equal(taskLink('p1', 't1', null), '/projects/p1?task=t1')
  assert.equal(taskLink('p1', 't1', 'c9'), '/projects/p1?task=t1&comment=c9')
})

test('the comment route passes the new comment id to the notification, and the notification stores it', () => {
  assert.match(read('server/api/tasks/[id]/comments.ts'), /notifyComment\(project, _task, [^)]*replyToId, comment!\.id\)/)
  assert.match(read('server/utils/notifyEvents.ts'), /commentId: string \| null = null/)
  assert.match(read('server/utils/notifyEvents.ts'), /\.\.\.\(commentId \? \{ commentId \} : \{\}\)/)
  assert.match(read('server/utils/notifications.ts'), /commentId: input\.commentId \?\? null/)
  assert.match(read('server/db/schema.ts'), /commentId: text\('comment_id'\)/)
})

test('the inbox opens a comment notification on its card with the comment in the query', () => {
  const inbox = read('app/pages/projects/inbox.vue')
  assert.match(inbox, /if \(item\.commentId\) \{\s*await router\.replace\(\{ query: \{ \.\.\.route\.query, task: item\.taskId, comment: item\.commentId \} \}\)/)
})
