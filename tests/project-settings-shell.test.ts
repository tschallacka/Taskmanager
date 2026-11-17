// Redesign 8/9, step 4: the project settings left list is one shell, drawn from the one section table, with the same list
// markup as the account shell (app/components/settings/Shell.vue). Only the sections the view can draw are listed; the
// danger sections and Customer access come in later steps. Run:
//   node --import tsx --test tests/project-settings-shell.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { builtProjectSections } from '../app/utils/projectSettingsSections'

const shell = readFileSync(new URL('../app/components/settings/ProjectShell.vue', import.meta.url), 'utf8')
const view = readFileSync(new URL('../app/components/kanban/ProjectSettingsView.vue', import.meta.url), 'utf8')
const account = readFileSync(new URL('../app/components/settings/Shell.vue', import.meta.url), 'utf8')

test('the built sections are the ten the card lists, in the card order, each on its own address', () => {
  const built = builtProjectSections()
  assert.deepEqual(built.map(s => s.key), ['general', 'members', 'customers', 'github', 'rules', 'secrets', 'fields', 'import', 'trash', 'archive'])
  assert.equal(built.find(s => s.key === 'github')?.path('42'), '/projects/42/settings/github')
})

test('every section is listed, Customer access, Import, Trash and Archive included', () => {
  const keys = builtProjectSections().map(s => s.key)
  for (const key of ['customers', 'import', 'trash', 'archive']) assert.equal(keys.includes(key as never), true, key)
})

// CQ 1 on 8/9 (Nina, 47d5aa1): the item buttons are one shared component, SectionNav.vue. The shell builds its items from
// the section table and hands them over; the markup, the ghost buttons and the current mark live in SectionNav.vue.
const sectionNav = readFileSync(new URL('../app/components/SectionNav.vue', import.meta.url), 'utf8')

test('the shell draws the list from the table, and every item links to its address', () => {
  assert.match(shell, /builtProjectSections/)
  assert.match(shell, /to: s\.path\(props\.projectId\)/)
  assert.match(shell, /<SectionNav/)
})

test('the shell keeps the account shell\'s labelled nav and the same left column; the items are ghost buttons with icons', () => {
  assert.match(shell, /<nav[\s\S]*aria-label="Settings sections"/)
  assert.match(shell, /lg:grid-cols-\[12rem_1fr\]/)
  assert.match(sectionNav, /variant="ghost"/)
  assert.match(sectionNav, /size="sm"/)
  // The account shell has the same labelled nav; the two lists read the same way.
  assert.match(account, /aria-label="Settings sections"/)
})

test('the shell marks the current section, and the mark is seen (a filled background), not only in the markup', () => {
  assert.match(sectionNav, /aria-current/)
  assert.match(sectionNav, /bg-elevated[^'"]*font-medium/)
  assert.match(shell, /:current="current"/)
  assert.equal(shell.includes('Teleport'), false, 'no top-bar title inside the board page')
})

test('the view draws its list through the shell and no longer keeps its own section table', () => {
  assert.match(view, /<SettingsProjectShell/)
  assert.equal(/const SECTIONS = \[/.test(view), false)
  assert.equal(/data-settings-section/.test(view), false)
})
