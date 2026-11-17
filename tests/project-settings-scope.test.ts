// Pat's FAIL on 8/9 (b8477d6), with Boss's answer: Import and Trash stay project settings sections, each on its own
// address. Customer access and Archive are sections too (the card's list); Archive holds the danger actions, boxed last.
// Team settings is a separate card and is not here. Source level plus the pure section table. Run:
//   node --import tsx --test tests/project-settings-scope.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { builtProjectSections, PROJECT_PANEL_COMPONENTS, settingsTargetFor } from '../app/utils/projectSettingsSections'

const root = new URL('../app/components/', import.meta.url)
const general = readFileSync(new URL('project-settings/ProjectGeneralSettings.vue', root), 'utf8')
const view = readFileSync(new URL('kanban/ProjectSettingsView.vue', root), 'utf8')

const NEW: Record<string, { file: string, name: string }> = {
  customers: { file: 'ProjectCustomerSettings', name: 'ProjectSettingsProjectCustomerSettings' },
  import: { file: 'ProjectImportSettings', name: 'ProjectSettingsProjectImportSettings' },
  trash: { file: 'ProjectTrashSettings', name: 'ProjectSettingsProjectTrashSettings' },
  archive: { file: 'ProjectArchiveSettings', name: 'ProjectSettingsProjectArchiveSettings' }
}

test('the left list has every section of the card, in the card order (Custom fields kept)', () => {
  assert.deepEqual(builtProjectSections().map(s => s.key), ['general', 'members', 'customers', 'github', 'rules', 'secrets', 'fields', 'import', 'trash', 'archive'])
})

test('each new section maps to its panel component, and the file exists under project-settings/', () => {
  for (const [key, { file, name }] of Object.entries(NEW)) {
    assert.equal(PROJECT_PANEL_COMPONENTS[key as keyof typeof PROJECT_PANEL_COMPONENTS], name, `${key} maps to ${name}`)
    assert.ok(existsSync(new URL(`project-settings/${file}.vue`, root)), `${file}.vue exists`)
  }
})

test('Custom fields keeps no panel component: its block stays in the view', () => {
  assert.equal(PROJECT_PANEL_COMPONENTS.fields, undefined)
})

test('General keeps only the general settings: Import, Archive and Delete have moved out of it', () => {
  assert.equal(general.includes('KanbanBoardImport'), false, 'Import moved')
  assert.equal(general.includes('data-archive-toggle'), false, 'Archive moved')
  assert.equal(general.includes('data-delete-open'), false, 'Delete moved')
})

test('the import, trash, archive and customer sections each have an address of their own', () => {
  for (const key of ['customers', 'import', 'trash', 'archive']) {
    assert.equal(settingsTargetFor('42', key), `/projects/42?view=settings&section=${key}`, key)
  }
})

// A panel that does not exist yet reads as empty, so its test fails on the assertion, not on the load.
const panelSource = (file: string) => existsSync(new URL(`project-settings/${file}.vue`, root)) ? readFileSync(new URL(`project-settings/${file}.vue`, root), 'utf8') : ''
const trashPanel = panelSource('ProjectTrashSettings')
const archivePanel = panelSource('ProjectArchiveSettings')
const customerPanel = panelSource('ProjectCustomerSettings')

test('Trash shows what is in the board trash and turns Show trashed on or off, from the board state', () => {
  assert.match(trashPanel, /trashedCount/)
  assert.match(trashPanel, /toggleShowTrashed/)
  assert.match(trashPanel, /data-trash-toggle/)
  assert.match(trashPanel, /Show trashed/)
})

test('Archive holds the archive toggle and the delete action, boxed, last in the list', () => {
  assert.match(archivePanel, /data-archive-toggle/)
  assert.match(archivePanel, /data-delete-open/)
  assert.match(archivePanel, /data-delete-confirm/)
})

test('Customer access shows the customer the project is filed under, read from the open project', () => {
  assert.match(customerPanel, /activeProject/)
  assert.match(customerPanel, /customerName/)
  assert.match(customerPanel, /data-customer-access/)
})

test('the settings view draws the four new sections (its accepted ?section= values include them)', () => {
  const line = view.match(/const VIEW_SECTIONS = \[([^\]]*)\]/)?.[1] ?? ''
  for (const key of ['customers', 'import', 'trash', 'archive']) assert.match(line, new RegExp(`'${key}'`), key)
  for (const { name } of Object.values(NEW)) assert.match(view, new RegExp(`<${name}\\b`), name)
})

test('the danger section (Archive) is the last one in the list, with Trash before it', () => {
  const keys = builtProjectSections().map(s => s.key)
  assert.equal(keys[keys.length - 1], 'archive')
  assert.equal(keys[keys.length - 2], 'trash')
})
