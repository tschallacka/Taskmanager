// The Inbox on a phone: a comment notification opens its card on the comment, and nothing takes the reader off to the board.
// The card's panel (TaskDrawer.vue) builds its "Open on board" link from the comment; an Inbox link must keep the comment, and a
// phone must not get a control that leaves the Inbox for the board (the back arrow is the way back there). Source checks.
// Run: node --import tsx --test tests/inbox-phone-open.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const drawer = readFileSync(new URL('../app/components/kanban/TaskDrawer.vue', import.meta.url), 'utf8')
const inbox = readFileSync(new URL('../app/pages/projects/inbox.vue', import.meta.url), 'utf8')

test('Open on board keeps the comment: it reads the comment from the Inbox query as well as the path', () => {
  assert.match(drawer, /const linkedComment = computed/)
  assert.match(drawer, /return taskLink\(task\.projectId, task\.id, linkedComment\.value/)
})

test('on a phone the Inbox panel has no Open on board control (the back arrow is the phone way back)', () => {
  const at = drawer.indexOf('data-open-on-board')
  assert.ok(at >= 0, 'the Open on board control carries data-open-on-board')
  const button = drawer.slice(at - 400, at + 40)
  assert.match(button, /class="[^"]*\bmax-md:hidden\b[^"]*"|class="hidden md:inline-flex[^"]*"|class="[^"]*\bhidden\b md:[^"]*"/)
})

test('a comment notification opens the card in place: the Inbox does not navigate for it', () => {
  const start = inbox.indexOf('if (item.taskId) {')
  const end = inbox.indexOf('} else if (item.type === \'message\'')
  assert.ok(start >= 0, 'the Inbox has the comment branch (if (item.taskId) {)')
  assert.ok(end > start, 'the comment branch ends before the message branch')
  const commentBranch = inbox.slice(start, end)
  assert.doesNotMatch(commentBranch, /navigateTo/)
  assert.match(commentBranch, /router\.replace\(\{ query: \{ \.\.\.route\.query, task: item\.taskId, comment: item\.commentId \} \}\)/)
})
