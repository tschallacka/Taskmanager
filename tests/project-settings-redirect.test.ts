// The per-section address /projects/<id>/settings/<key> only redirects (the ruling): it answers with the board page's
// settings tab, ?view=settings&section=<legacy key>. The settings view stays in the board page. Sections the view does not
// have yet (Customer access, Import, Trash, Archive) land on the tab's General. Run:
//   node --import tsx --test tests/project-settings-redirect.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { settingsTargetFor } from '../app/utils/projectSettingsSections'

const config = readFileSync(new URL('../nuxt.config.ts', import.meta.url), 'utf8')

test('an existing section redirects to the board page settings tab, with its legacy key', () => {
  assert.equal(settingsTargetFor('p1', 'general'), '/projects/p1?view=settings&section=general')
  assert.equal(settingsTargetFor('p1', 'members'), '/projects/p1?view=settings&section=members')
  assert.equal(settingsTargetFor('p1', 'rules'), '/projects/p1?view=settings&section=rules')
  assert.equal(settingsTargetFor('p1', 'secrets'), '/projects/p1?view=settings&section=secrets')
  assert.equal(settingsTargetFor('p1', 'fields'), '/projects/p1?view=settings&section=fields')
  assert.equal(settingsTargetFor('p1', 'github'), '/projects/p1?view=settings&section=repositories')
})

test('a section the view does not have yet lands on the tab’s General', () => {
  assert.equal(settingsTargetFor('p1', 'customers'), '/projects/p1?view=settings')
  assert.equal(settingsTargetFor('p1', 'import'), '/projects/p1?view=settings')
  assert.equal(settingsTargetFor('p1', 'trash'), '/projects/p1?view=settings')
  assert.equal(settingsTargetFor('p1', 'archive'), '/projects/p1?view=settings')
})

test('the route is registered as a sibling of the board page, with a redirect component', () => {
  assert.match(config, /'pages:extend'/)
  assert.match(config, /\/projects\/:id\/settings\/:section/)
  assert.match(config, /ProjectSettingsRedirect\.vue/)
})
