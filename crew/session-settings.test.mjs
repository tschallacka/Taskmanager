// The per-person settings file of a background session (card mwf45rzxf8z9wtv9nv). Pure, no real claude. Run:
//   node --test crew/session-settings.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DENY_RULES, settingsFor, settingsPath, writeSettingsFile } from './session-settings.mjs'
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
