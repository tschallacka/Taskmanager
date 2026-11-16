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

test('the team crews board picker uses AppSelect with its placeholder, and no native select is left in it', () => {
  const crews = read('app/components/TeamCrewsPanel.vue')
  assert.doesNotMatch(crews, /<select[\s>]/, 'the board picker is no longer a native select')
  assert.match(crews, /<AppSelect\s[\s\S]*?data-team-crew-board/)
  assert.match(crews, /placeholder="Pick a board"/)
})

test('the project owner picker uses AppSelect, lists the staff, and hands the owner over on change', () => {
  const general = read('app/components/kanban/ProjectGeneralSettings.vue')
  assert.doesNotMatch(general, /<select[\s>]/, 'the owner picker is no longer a native select')
  assert.match(general, /<AppSelect\s[\s\S]*?data-owner-select/)
  assert.match(general, /:options="ownerOptions"/)
  assert.match(general, /@update:model-value="changeOwner"/)
  assert.match(general, /const ownerOptions = computed\(\(\) => staff\.value\.map\(person => \(\{ label: person\.name \|\| person\.email, value: person\.id \}\)\)\)/)
})

test('the team rule mode picker uses AppSelect with its two modes, and switches the mode on change', () => {
  const builder = read('app/components/TeamRuleBuilder.vue')
  assert.doesNotMatch(builder, /<select[\s>]/, 'the mode picker is no longer a native select')
  assert.match(builder, /<AppSelect\s[\s\S]*?data-rule-mode/)
  assert.match(builder, /value: 'by_name'/)
  assert.match(builder, /value: 'column_free'/)
  assert.match(builder, /@update:model-value="setModeFromPicker"/)
})

test('the team invite role select uses AppSelect, and Admin is offered to owners only', () => {
  const invites = read('app/components/TeamInvitesPanel.vue')
  assert.doesNotMatch(invites, /<select[\s>]/, 'the role select is no longer a native select')
  assert.match(invites, /<AppSelect\s[\s\S]*?data-invite-role/)
  assert.match(invites, /\{ label: 'Member', value: 'member' \}/)
  assert.match(invites, /\.\.\.\(props\.isOwner \? \[\{ label: 'Admin', value: 'admin' \}\] : \[\]\)/)
})
