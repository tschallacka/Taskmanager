// Redesign 8/9, step 3: each project settings section that has a panel renders from its own component under
// app/components/project-settings/. Customer access, Custom fields, Import, Trash and Archive have none in this step
// (Custom fields keeps its block in the view until its state moves; the others need a decision on the card).
// Source level. Run:
//   node --import tsx --test tests/project-settings-components.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { PROJECT_PANEL_COMPONENTS } from '../app/utils/projectSettingsSections'

const root = new URL('../app/components/', import.meta.url)
const view = readFileSync(new URL('kanban/ProjectSettingsView.vue', root), 'utf8')

// The panel's file, and the name Nuxt gives it under project-settings/ (folder name, then file name).
const PANELS: Record<string, { file: string, name: string }> = {
  general: { file: 'ProjectGeneralSettings', name: 'ProjectSettingsProjectGeneralSettings' },
  github: { file: 'ProjectGithubSettings', name: 'ProjectSettingsProjectGithubSettings' },
  rules: { file: 'ProjectRulesSettings', name: 'ProjectSettingsProjectRulesSettings' },
  members: { file: 'ProjectMembersSettings', name: 'ProjectSettingsProjectMembersSettings' },
  secrets: { file: 'ProjectSecretsSettings', name: 'ProjectSettingsProjectSecretsSettings' }
}

test('the component map names one component for each section that has a panel', () => {
  for (const [key, { name }] of Object.entries(PANELS)) {
    assert.equal(PROJECT_PANEL_COMPONENTS[key as keyof typeof PROJECT_PANEL_COMPONENTS], name, `${key} maps to ${name}`)
  }
})

test('each panel lives under project-settings/, and its old kanban file is gone', () => {
  for (const { file } of Object.values(PANELS)) {
    assert.ok(existsSync(new URL(`project-settings/${file}.vue`, root)), `project-settings/${file}.vue exists`)
    assert.equal(existsSync(new URL(`kanban/${file}.vue`, root)), false, `kanban/${file}.vue moved away`)
  }
})

test('Custom fields is the only section with no panel component (its block stays in the view)', () => {
  assert.equal(PROJECT_PANEL_COMPONENTS.fields, undefined)
})

test('the view renders each panel from its component, not from the kanban folder', () => {
  for (const { name } of Object.values(PANELS)) {
    assert.match(view, new RegExp(`<${name}\\b`), `view renders ${name}`)
  }
  assert.equal(/<KanbanProject(General|Github|Rules|Members|Secrets)Settings\b/.test(view), false)
})

test('the view still keeps the Custom fields block in place', () => {
  assert.match(view, /data-custom-fields/)
})
