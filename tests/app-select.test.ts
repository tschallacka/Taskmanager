// The shared select (AppSelect) and the team invite role select that uses it (source level): the open list is drawn
// by Nuxt UI, not the browser, and the Admin choice is offered to owners only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('AppSelect renders through USelect with the options, placeholder and disabled state it is given', () => {
  const select = read('app/components/AppSelect.vue')
  assert.match(select, /<USelect/)
  assert.match(select, /:items="props\.options"/)
  assert.match(select, /value-key="value"/)
  assert.match(select, /:placeholder="props\.placeholder"/)
  assert.match(select, /:disabled="props\.disabled"/)
  assert.doesNotMatch(select, /<select[\s>]/, 'no native select: its open list does not follow the theme')
})

test('AppSelect is 44 px tall at phone width (a touch target), and keeps its normal height from small screens up', () => {
  const select = read('app/components/AppSelect.vue')
  assert.match(select, /min-h-11/, 'a 44 px minimum height (Tailwind min-h-11) at phone width')
  assert.match(select, /sm:min-h-0/, 'the 44 px minimum is lifted from the sm breakpoint up')
})

test('the team invite role select uses AppSelect, and Admin is offered to owners only', () => {
  const invites = read('app/components/TeamInvitesPanel.vue')
  assert.doesNotMatch(invites, /<select[\s>]/, 'the role select is no longer a native select')
  assert.match(invites, /<AppSelect\s[\s\S]*?data-invite-role/)
  assert.match(invites, /\{ label: 'Member', value: 'member' \}/)
  assert.match(invites, /\.\.\.\(props\.isOwner \? \[\{ label: 'Admin', value: 'admin' \}\] : \[\]\)/)
})
