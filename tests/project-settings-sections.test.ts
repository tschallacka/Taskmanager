// The project settings sections, each on its own address (redesign 8/9, the project settings shell, step 1). The card's list
// in order, with Custom fields kept so nothing is removed; the old ?section= values map to the new keys. Run:
//   node --import tsx --test tests/project-settings-sections.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROJECT_SECTIONS, projectSettingsPath, sectionKeyForQuery } from '../app/utils/projectSettingsSections'

test('the sections are the card list, in order, with Custom fields kept', () => {
  assert.deepEqual(
    PROJECT_SECTIONS.map(section => section.label),
    ['General', 'Members', 'Customer access', 'GitHub', 'Rules', 'Secrets', 'Custom fields', 'Import', 'Trash', 'Archive']
  )
})

test('each section has its own key and address, and no two share one', () => {
  const keys = PROJECT_SECTIONS.map(section => section.key)
  assert.equal(new Set(keys).size, keys.length)
  assert.equal(new Set(PROJECT_SECTIONS.map(section => section.path(':id'))).size, keys.length)
})

test('an address is /projects/<id>/settings/<key>', () => {
  assert.equal(projectSettingsPath('p1', 'members'), '/projects/p1/settings/members')
  assert.equal(projectSettingsPath('p1', 'general'), '/projects/p1/settings/general')
})

test('the danger sections (Trash, Archive) come last', () => {
  const keys = PROJECT_SECTIONS.map(section => section.key)
  assert.deepEqual(keys.slice(-2), ['trash', 'archive'])
})

test('an old ?section= value goes to its section (repositories is now GitHub)', () => {
  assert.equal(sectionKeyForQuery('general'), 'general')
  assert.equal(sectionKeyForQuery('repositories'), 'github')
  assert.equal(sectionKeyForQuery('rules'), 'rules')
  assert.equal(sectionKeyForQuery('members'), 'members')
  assert.equal(sectionKeyForQuery('secrets'), 'secrets')
  assert.equal(sectionKeyForQuery('fields'), 'fields')
  assert.equal(sectionKeyForQuery('nope'), undefined)
  assert.equal(sectionKeyForQuery(undefined), undefined)
})
