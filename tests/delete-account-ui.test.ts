// The Delete my account panel (card mwjfpokj5rvl92bserd): what the confirm text says, that the typed confirmation must
// match the signed-in address, and that the route, the panel and the settings page are wired together. Pure and
// source-level, no server. Run:
//   node --import tsx --test tests/delete-account-ui.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { confirmMatches, deletionLines } from '../shared/utils/deleteAccountText'

const read = (path: string) => readFileSync(join(import.meta.dirname, '..', path), 'utf8')

test('the confirm text names the personal boards and their attachment files', () => {
  const text = deletionLines().join(' ')
  assert.match(text, /personal board/i)
  assert.match(text, /no other member/i)
  assert.match(text, /tasks/i)
  assert.match(text, /attachment files/i)
})

test('the confirm text says what is kept, under "Deleted user", and what is cleared', () => {
  const text = deletionLines().join(' ')
  assert.match(text, /Deleted user/)
  assert.match(text, /comments/i)
  assert.match(text, /time/i)
  assert.match(text, /team/i)
})

test('the confirm text says it cannot be undone, and that teams you own come first', () => {
  const text = deletionLines().join(' ')
  assert.match(text, /cannot be undone/i)
  assert.match(text, /own/i)
})

test('the typed confirmation must match the signed-in address, ignoring case and spaces', () => {
  assert.equal(confirmMatches('Ann@Example.com ', 'ann@example.com'), true)
  assert.equal(confirmMatches('ann@example.co', 'ann@example.com'), false)
  assert.equal(confirmMatches('', 'ann@example.com'), false)
  assert.equal(confirmMatches(undefined, 'ann@example.com'), false)
})

test('the route deletes the signed-in person only, after the typed confirmation', () => {
  const route = read('server/api/account/delete.post.ts')
  assert.match(route, /confirmMatches\(/)
  assert.match(route, /deleteAccount\(me\.id\)/)
  assert.doesNotMatch(route, /readBody[\s\S]*deleteAccount\(body/, 'the id comes from the session, never from the body')
})

test('the settings account section shows the button, and the button opens a confirm dialog', () => {
  assert.match(read('app/pages/settings/index.vue'), /<DeleteAccountPanel \/>/)
  // At the top of app/components, so the tag is <DeleteAccountPanel> (a folder would prefix the name).
  const panel = read('app/components/DeleteAccountPanel.vue')
  assert.match(panel, /deletionLines\(\)/)
  assert.match(panel, /\/api\/account\/delete/)
  assert.match(panel, /confirmMatches\(/)
  // The confirmation is a dialog: the button opens it, and nothing is deleted until it is confirmed inside.
  assert.match(panel, /<UModal/)
  assert.match(panel, /v-model:open="open"/)
  assert.match(panel, /label="Delete my account"/)
  assert.match(panel, /@click="remove"/)
})

test('the dialog shows the consequences, the typed confirmation, and the team refusal with the way to the team page', () => {
  const panel = read('app/components/DeleteAccountPanel.vue')
  assert.match(panel, /refusal\.teams/)
  assert.match(panel, /to="\/team"/)
  assert.match(panel, /v-for="line in lines"/)
})

test('the dialog footer stacks its two buttons at phone width, and end-aligns them from sm up', () => {
  // Quincy, 390 px: "Keep my account" was clipped off the left edge while the footer only justified to the end. The
  // footer is a column under sm and a row from sm up, so both buttons stay inside the dialog at 390 px.
  const panel = read('app/components/DeleteAccountPanel.vue')
  const footer = /<template #footer>\s*<div class="([^"]+)"/.exec(panel)
  assert.ok(footer, 'the footer has a div with classes')
  const classes = footer[1]!.split(/\s+/)
  assert.ok(classes.includes('flex'), 'the footer is a flex container')
  assert.ok(classes.includes('flex-col'), 'the buttons stack on a phone')
  assert.ok(classes.includes('sm:flex-row'), 'the buttons sit in a row from sm up')
  assert.ok(classes.includes('sm:justify-end'), 'the row is end-aligned from sm up')
  assert.ok(!classes.includes('justify-end'), 'justify-end at phone width is what clipped the button')
})
