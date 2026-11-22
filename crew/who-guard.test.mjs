// The who guard (crew/who-guard.mjs, card mwghrx2k8dwf8h93say, optional part): a session started for one person has CREW_WHO
// set to that key, and crew refuses to run any other person's key from it. A shell with no CREW_WHO (Boss's) is not touched.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { whoGuard, guardedKey } from './who-guard.mjs'
import { settingsFor } from './session-settings.mjs'

test('a session bound to one key may run its own key and nothing else', () => {
  assert.deepEqual(whoGuard('wick', { CREW_WHO: 'wick' }), { ok: true })
  const refused = whoGuard('boss', { CREW_WHO: 'wick' })
  assert.equal(refused.ok, false)
  assert.match(refused.reason, /this session is wick; it may not run crew boss/)
  assert.equal(whoGuard('pm', { CREW_WHO: 'wick' }).ok, false)
})

test('a shell with no CREW_WHO is not guarded: Boss runs every key', () => {
  assert.deepEqual(whoGuard('boss', {}), { ok: true })
  assert.deepEqual(whoGuard('pia', { CREW_WHO: '' }), { ok: true })
})

test('commands that are not a person key pass through, and listen and channel name the key second', () => {
  assert.equal(guardedKey('update', ['wick', 'mw1', 'x.md']), null, 'update names its key first, so it is the first word')
  assert.equal(guardedKey('listen', ['boss', '60']), 'boss')
  assert.equal(guardedKey('channel', ['pm']), 'pm')
  assert.equal(guardedKey('session', ['start', 'wick', '/x']), null, 'session has no key first')
  assert.equal(guardedKey('-h', []), null)
})

test('crew refuses another key from a bound session, before any command runs (exit 64)', () => {
  const crewJs = fileURLToPath(new URL('./crew.mjs', import.meta.url))
  const refused = spawnSync(process.execPath, [crewJs, 'boss', 'tools'], { env: { ...process.env, CREW_WHO: 'wick' }, encoding: 'utf8' })
  assert.equal(refused.status, 64)
  assert.match(refused.stderr, /this session is wick; it may not run crew boss/)
})

test('a session settings file names the session key in its env, so the guard has it', () => {
  const settings = settingsFor({ home: '/crew/home', key: 'wick' })
  assert.equal(settings.env.CREW_WHO, 'wick')
  assert.equal(settings.env.CREW_HOME, '/crew/home')
})
