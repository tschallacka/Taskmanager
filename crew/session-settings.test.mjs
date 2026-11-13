// The per-person settings file of a background session (card mwf45rzxf8z9wtv9nv). Pure, no real claude. Run:
//   node --test crew/session-settings.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DENY_RULES, longRunEnv, settingsFor, settingsPath, writeSettingsFile } from './session-settings.mjs'
import { startArgs } from './session.mjs'

const WORKERS = ['wren', 'wick', 'wynn', 'wade']

// The settings file a start argv names. A start with no --settings flag throws: that is the check every start must pass.
function settingsFlagOf(args) {
  const at = args.indexOf('--settings')
  if (at < 0 || at + 1 >= args.length) throw new Error('the start has no --settings flag')
  return args[at + 1]
}

test('the settings deny the restart_self tool, set the own CREW_HOME, and turn remote control off', () => {
  const home = '/crew/home'
  const s = settingsFor({ home, key: 'wren' })
  assert.deepEqual(s.permissions.deny, ['mcp__git__restart_self'])
  assert.ok(DENY_RULES.includes('mcp__git__restart_self'))
  assert.equal(s.env.CREW_HOME, home, 'the person gets its own crew home, not an inherited one')
  assert.equal(s.remoteControlAtStartup, false)
})

test('the settings file is CREW_HOME/settings/<key>.json, written mode 600 with the same content', () => {
  const home = mkdtempSync(join(tmpdir(), 'settings-home-'))
  const path = writeSettingsFile(home, 'wick')
  assert.equal(path, join(home, 'settings', 'wick.json'))
  assert.equal(path, settingsPath(home, 'wick'))
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), settingsFor({ home, key: 'wick' }))
})

test('a key that is not a short lower-case name gets no settings path', () => {
  assert.throws(() => settingsPath('/h', '../etc'), /no such person key/)
  assert.throws(() => settingsFor({ home: '/h', key: 'Wren Worker' }), /no such person key/)
})

test('every worker start carries --settings with that person\'s own file, once, and no inline settings', () => {
  const home = '/crew/home'
  for (const key of WORKERS) {
    const { args } = startArgs({ key, folder: '/tmp', home, kit: '/kit', role: 'r' })
    assert.equal(settingsFlagOf(args), join(home, 'settings', `${key}.json`), `${key}: the flag names its own file`)
    assert.equal(args.filter(a => a === '--settings').length, 1, `${key}: one --settings flag only (two do not merge)`)
    assert.ok(!args.some(a => a.startsWith('{')), `${key}: no inline JSON in the argv`)
  }
})

test('a start argv without a --settings flag fails the check', () => {
  const { args } = startArgs({ key: 'wade', folder: '/tmp', home: '/h', kit: '/k', role: 'r' })
  const withoutFlag = args.filter((a, i) => a !== '--settings' && args[i - 1] !== '--settings')
  assert.throws(() => settingsFlagOf(withoutFlag), /no --settings flag/)
})

const HERE = dirname(fileURLToPath(import.meta.url))

test('the long-run profile env is read from the kit folder; a missing profile gives none', () => {
  const kit = mkdtempSync(join(tmpdir(), 'settings-kit-'))
  writeFileSync(join(kit, 'claude-long-run.json'), JSON.stringify({ env: { BASH_MAX_TIMEOUT_MS: '7200000', MCP_TIMEOUT: '60000' } }))
  assert.deepEqual(longRunEnv(kit), { BASH_MAX_TIMEOUT_MS: '7200000', MCP_TIMEOUT: '60000' })
  assert.deepEqual(longRunEnv(join(kit, 'nowhere')), {})
})

test('the person settings file carries the long-run profile env, with the own CREW_HOME and the deny rule', () => {
  const home = mkdtempSync(join(tmpdir(), 'settings-long-'))
  const profile = longRunEnv(HERE)
  assert.equal(profile.BASH_MAX_TIMEOUT_MS, '7200000', 'the kit profile names the owner\'s bash timeout')
  const path = writeSettingsFile(home, 'wren', { profileEnv: profile })
  const file = JSON.parse(readFileSync(path, 'utf8'))
  assert.equal(file.env.BASH_MAX_TIMEOUT_MS, '7200000', 'the file carries the long-run env')
  assert.equal(file.env.CREW_HOME, home, 'the person keeps its own CREW_HOME')
  assert.deepEqual(file.permissions.deny, ['mcp__git__restart_self'], 'the deny rule is still there')
  assert.equal(file.remoteControlAtStartup, false)
})

test('a profile can never override the person\'s own CREW_HOME', () => {
  const s = settingsFor({ home: '/own/home', key: 'wick', profileEnv: { CREW_HOME: '/other/home', MCP_TIMEOUT: '60000' } })
  assert.equal(s.env.CREW_HOME, '/own/home')
  assert.equal(s.env.MCP_TIMEOUT, '60000')
})
