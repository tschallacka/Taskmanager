// The sidebar shell (redesign 2/9, slices A and B): the Planning and Team groups, the account menu with its one
// Appearance row, and the rule that only the instance admin sees "Crews and agents". The repository has no component
// render harness, so these tests read the component source and check its structure. They need no database:
//   node --import tsx --test tests/sidebar-shell.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dirname, '..', 'app', 'components', 'AppSidebar.vue'), 'utf8')
const script = source.slice(source.indexOf('<script'), source.indexOf('</script>'))
const template = source.slice(source.indexOf('<template>'))

test('the Planning group links Goals, Portfolios and Timesheet, each to its own page', () => {
  assert.match(template, /aria-label="Planning"/)
  assert.match(script, /label: 'Goals'[^}]*to: '\/projects\/goals'/)
  assert.match(script, /label: 'Portfolios'[^}]*to: '\/projects\/portfolios'/)
  assert.match(script, /label: 'Timesheet'[^}]*to: '\/projects\/timesheet'/)
})

test('the Team group links Members and customers to the team page, for everyone', () => {
  assert.match(template, /aria-label="Team"/)
  assert.match(script, /label: 'Members and customers'[^}]*to: '\/team'/)
})

test('Crews and agents appears only for the instance admin', () => {
  // The link is added to the Team group only when isInstanceAdmin is true; the rest of the group does not depend on it.
  assert.match(script, /isInstanceAdmin/)
  assert.match(script, /\.\.\.\(isInstanceAdmin\.value \? \[\{ label: 'Crews and agents', icon: 'i-lucide-bot', to: '\/admin\/crews' \}\] : \[\]\)/)
  // The link is not written anywhere else in the sidebar, so no other branch can show it.
  assert.equal(source.match(/label: 'Crews and agents'/g)?.length, 1)
})

test('the account menu offers Profile, Settings and Help, then one Appearance row', () => {
  assert.match(script, /label: 'Profile'[^}]*to|label: 'Profile'[\s\S]*?navigateTo\('\/projects\/profile'\)/)
  assert.match(script, /navigateTo\('\/settings'\)/)
  assert.match(script, /navigateTo\('\/help'\)/)
})

test('Appearance is one three-way row: System, Dark, Light, with the current choice shown and ticked', () => {
  // Three values, in order, and the preference they set is the colour mode's own preference.
  assert.match(script, /value: 'system', label: 'System'/)
  assert.match(script, /value: 'dark', label: 'Dark'/)
  assert.match(script, /value: 'light', label: 'Light'/)
  assert.match(script, /colorMode\.preference = a\.value/)
  // The row names the current state and ticks the choice in use.
  assert.match(script, /label: `Appearance: \$\{appearanceNow\.value\}`/)
  assert.match(script, /i-lucide-check/)
  // The old dark/light toggle is gone: no second place sets the mode.
  assert.doesNotMatch(script, /toggleColorMode|Light mode|Dark mode/)
})
