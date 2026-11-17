// Each account settings section is its own component (redesign 8/9, step B): the section table names one for each
// section, the file exists, and the page no longer holds the moved sections inline. The page keeps the shell and the list.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { ACCOUNT_SECTIONS, SECTION_COMPONENTS } from '../app/utils/settingsSections'

const componentsDir = new URL('../app/components/settings/', import.meta.url)
const page = readFileSync(new URL('../app/pages/settings/index.vue', import.meta.url), 'utf8')

test('the section table names a component for every section', () => {
  for (const section of ACCOUNT_SECTIONS) {
    assert.ok(SECTION_COMPONENTS[section.key], `no component for ${section.key}`)
  }
})

test('every section component has its own file under app/components/settings/', () => {
  for (const section of ACCOUNT_SECTIONS) {
    const name = SECTION_COMPONENTS[section.key]
    assert.ok(existsSync(new URL(`${name.replace(/^Settings/, '')}.vue`, componentsDir)), `${name} has no file`)
  }
})

test('the page no longer holds the moved sections inline', () => {
  assert.equal(page.includes('id="ai"'), false)
  assert.equal(page.includes('id="appearance"'), false)
  assert.equal(page.includes('AI (OpenRouter)'), false)
})

test('the page keeps the section list and the shell', () => {
  assert.ok(page.includes('aria-label="Settings sections"'))
  assert.ok(page.includes('v-for="s in sections"'))
})
