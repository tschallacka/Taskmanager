// Run: cd crew && node --test claude.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { CHECKED_VERSION, claudeArgs, mergeSettings, profilePath, versionWarning, writeMergedSettings } from './claude.mjs'

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

test('the merged PM file keeps the profile env and the PM hooks, in one file', () => {
  const session = JSON.parse(readFileSync(join(kit, 'pia-session.settings.json'), 'utf8'))
  const merged = mergeSettings(profile, session)
  assert.deepEqual(merged.env, profile.env, 'every profile env value is in the merged file')
  assert.deepEqual(merged.hooks, session.hooks, 'the PM hooks are in the merged file')
  assert.ok(Object.keys(merged.env).length >= 8)
})

test('claudeArgs passes the one settings file it is given, and the profile when it is given none', () => {
  assert.deepEqual(claudeArgs(kit, ['--continue'], '/x/settings.merged.json'), ['--settings', '/x/settings.merged.json', '--continue'])
  assert.deepEqual(claudeArgs(kit, ['--continue']), ['--settings', profilePath(kit), '--continue'])
})

test('writeMergedSettings writes one file that has both the env and the hooks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'merged-settings-'))
  try {
    const out = writeMergedSettings(kit, join(kit, 'pia-session.settings.json'), join(dir, 'settings.merged.json'))
    const written = JSON.parse(readFileSync(out, 'utf8'))
    assert.deepEqual(written.env, profile.env)
    assert.ok(written.hooks && Object.keys(written.hooks).length > 0, 'the hooks are in the file')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the PM start line makes one merged file and passes it as the only --settings', () => {
  const tmpl = readFileSync(join(kit, 'PROMPTS.md.tmpl'), 'utf8')
  const line = tmpl.split('\n').find((l) => l.includes('claude --model {{models.pia.model}}'))
  assert.ok(line, 'the PM start line is in PROMPTS.md.tmpl')
  assert.equal(line.split('--settings').length - 1, 1, 'Claude Code takes only the last --settings, so there is one')
  assert.ok(line.includes('--settings {{crew_dir}}/pia-session/settings.merged.json'))
  assert.ok(line.includes('claude.mjs merge {{kit_dir}}/pia-session.settings.json {{crew_dir}}/pia-session/settings.merged.json'))
  assert.ok(tmpl.indexOf('claude.mjs merge') < tmpl.indexOf('--settings {{crew_dir}}/pia-session/settings.merged.json'))
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

test('the PM session file has the profile env and its listener hooks, and nothing else the profile lacks', () => {
  const pia = JSON.parse(readFileSync(join(kit, 'pia-session.settings.json'), 'utf8'))
  assert.equal(pia.env, undefined, 'the env block lives only in claude-long-run.json, passed with the PM file')
  const commands = JSON.stringify(pia.hooks)
  assert.match(commands, /pia-listener-hook\.sh\\" stop/)
  assert.match(commands, /pia-listener-hook\.sh\\" sessionstart/)
  assert.match(commands, /\$CREW_HOME\/bin\//, 'the hook is found through CREW_HOME, not a fixed path')
  assert.equal(pia.permissions, undefined, 'the PM rules stay in the session folder, not in the kit')
})
