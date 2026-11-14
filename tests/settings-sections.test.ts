// The account settings sections and their addresses (redesign 8/9). Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/settings-sections.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACCOUNT_SECTIONS, sectionPathForHash } from '../app/utils/settingsSections'

test('every section has its own address, and no two share one', () => {
  const paths = ACCOUNT_SECTIONS.map(section => section.path)
  assert.equal(new Set(paths).size, paths.length)
  for (const path of paths) assert.match(path, /^\/settings(\/[a-z-]+)?$/)
})

test('the sections keep the order and labels of the account page', () => {
  assert.deepEqual(
    ACCOUNT_SECTIONS.map(section => section.label),
    ['Your stats', 'Account', 'Appearance', 'API keys and MCP', 'AI']
  )
})

test('an old hash link goes to its section address', () => {
  assert.equal(sectionPathForHash('#account'), '/settings/account')
  assert.equal(sectionPathForHash('#appearance'), '/settings/appearance')
  assert.equal(sectionPathForHash('#api-keys'), '/settings/api-keys')
  assert.equal(sectionPathForHash('#ai'), '/settings/ai')
})

test('the stats hash stays on the settings address', () => {
  assert.equal(sectionPathForHash('#stats'), '/settings')
})

test('a hash that is not a section has no address, and an empty hash has none', () => {
  assert.equal(sectionPathForHash('#nope'), undefined)
  assert.equal(sectionPathForHash(''), undefined)
  assert.equal(sectionPathForHash('#'), undefined)
})
