// The last person avatars on the shared UserAvatar (source level): time grid, draft task, customer contacts, team members,
// the task composer and the inbox. The inbox needs the actor id from the server, so the notification shape carries it.
// The agent and GitHub icons on task comments are not people, so they stay on UAvatar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the time grid keys the person avatar by the author id', () => {
  const grid = read('app/components/TimeGrid.vue')
  assert.doesNotMatch(grid, /<UAvatar/)
  assert.match(grid, /<UserAvatar[\s\S]*?:user-id="row\.key"/)
})

test('the draft task names the person by their id', () => {
  const draft = read('app/components/DraftTaskModal.vue')
  assert.doesNotMatch(draft, /<UAvatar/)
  assert.match(draft, /<UserAvatar[\s\S]*?:user-id="person\.id"/)
})

test('customer contacts and team members use their user ids', () => {
  const customers = read('app/components/CustomersModal.vue')
  assert.doesNotMatch(customers, /<UAvatar/)
  assert.match(customers, /<UserAvatar[\s\S]*?:user-id="contact\.userId"/)
  const team = read('app/pages/team.vue')
  assert.doesNotMatch(team, /<UAvatar/)
  assert.match(team, /<UserAvatar[\s\S]*?:user-id="m\.userId"/)
})

test('the composer shows the signed-in person, and its old initials helper is gone', () => {
  const comments = read('app/components/kanban/TaskComments.vue')
  assert.match(comments, /<UserAvatar[\s\S]*?:user-id="session\?\.user\?\.id \?\? ''"/)
  assert.doesNotMatch(comments, /userInitials/)
  assert.doesNotMatch(comments, /function initials\(/)
})

test('the agent and GitHub icons on comments stay as icon avatars, not people', () => {
  const comments = read('app/components/kanban/TaskComments.vue')
  assert.match(comments, /<UAvatar\s[\s\S]*?:icon="isGithubUpdate\(comment\) \? 'i-lucide-github' : 'i-lucide-bot'"/)
})

test('the inbox uses the actor id, and the server sends it with the notification', () => {
  const inbox = read('app/pages/projects/inbox.vue')
  assert.doesNotMatch(inbox, /<UAvatar/)
  assert.match(inbox, /<UserAvatar[\s\S]*?:user-id="item\.actorId \?\? ''"/)
  const route = read('server/api/notifications/index.get.ts')
  assert.match(route, /actorId: notifications\.actorId,/)
  const composable = read('app/composables/useNotifications.ts')
  assert.match(composable, /actorId: string \| null/)
})
