// Run: cd crew && node --test claude.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHECKED_VERSION, claudeArgs, profilePath, versionWarning } from './claude.mjs'

const kit = dirname(fileURLToPath(import.meta.url))
const profile = JSON.parse(readFileSync(join(kit, 'claude-long-run.json'), 'utf8'))
const readme = readFileSync(join(kit, 'README.md'), 'utf8')
const section = readme.slice(readme.indexOf('## Claude Code limits'), readme.indexOf('## Commands'))

test('the profile is valid JSON with an env block of strings', () => {
  assert.equal(typeof profile.env, 'object')
  for (const [k, v] of Object.entries(profile.env)) assert.equal(typeof v, 'string', k)
})

test('the profile sets the values the card asks for', () => {
  assert.equal(profile.env.BASH_DEFAULT_TIMEOUT_MS, '1800000')
  assert.equal(profile.env.BASH_MAX_OUTPUT_LENGTH, '150000')
})

test('the output cap is not raised above what Claude Code allows', () => {
  assert.ok(Number(profile.env.BASH_MAX_OUTPUT_LENGTH) <= 150000)
})

test('every variable the README section names is in the profile', () => {
  const named = [...section.matchAll(/`([A-Z][A-Z0-9_]+)`/g)].map((m) => m[1])
  const vars = [...new Set(named.filter((n) => n.startsWith('BASH_') || n.startsWith('CLAUDE_') || n.startsWith('MCP_')))]
  assert.ok(vars.length >= 8, 'the README names the variables')
  for (const v of vars) assert.ok(v in profile.env, `${v} is named in the README but not in the profile`)
})

test('the wrapper passes the profile first, then the owner arguments', () => {
  assert.deepEqual(claudeArgs(kit, ['--continue']), ['--settings', profilePath(kit), '--continue'])
  assert.deepEqual(claudeArgs(kit), ['--settings', profilePath(kit)])
})

test('a Claude Code older than the checked version gets a warning', () => {
  assert.match(versionWarning('2.1.100 (Claude Code)'), /older than 2\.1\.319/)
})

test('the checked version or a newer one gets no warning', () => {
  assert.equal(versionWarning(`${CHECKED_VERSION} (Claude Code)`), null)
  assert.equal(versionWarning('2.2.0 (Claude Code)'), null)
})

test('an unreadable version says so', () => {
  assert.match(versionWarning('no version here'), /could not read/)
})
