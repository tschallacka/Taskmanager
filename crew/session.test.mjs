// `crew session` with a fake claude (no real session is started). Run: node --test crew/session.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  startArgs, parseAgents, liveById, planWake, checkKey, startSession, sessionStatus, sessionList, stopSession,
  readRecord, NO_REMOTE_SETTINGS, MODEL
} from './session.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

// A fake claude: `agents --json` prints the state file; `--bg -n <key>` adds a live session with a new id; `stop <id>` ends
// it. Every call is appended to the log file, so a test can see the argv.
function fakeClaude() {
  const dir = mkdtempSync(join(tmpdir(), 'session-fake-'))
  const state = join(dir, 'agents.json')
  const log = join(dir, 'calls.log')
  writeFileSync(state, '[]')
  const bin = join(dir, 'claude')
  writeFileSync(bin, `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n')
const list = JSON.parse(fs.readFileSync(${JSON.stringify(state)}, 'utf8'))
if (args[0] === 'agents' && args[1] === '--json') { process.stdout.write(JSON.stringify(list)); process.exit(0) }
if (args.includes('--bg')) {
  const name = args[args.indexOf('-n') + 1]
  const id = 'id' + (list.length + 1) + name
  list.push({ id, name, state: 'idle', status: 'running', startedAt: Date.now() + list.length })
  fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify(list))
  process.stdout.write(id + '\\n'); process.exit(0)
}
if (args[0] === 'stop') {
  const hit = list.find(a => a.id === args[1])
  if (!hit) { process.stderr.write('no such session'); process.exit(1) }
  hit.state = 'ended'
  fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify(list))
  process.exit(0)
}
process.exit(2)
`)
  chmodSync(bin, 0o755)
  return { bin, state, log, dir }
}

function calls(fake) {
  return readFileSync(fake.log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
}

test('the start argv turns remote control off, names the session, and sets the model and the role', () => {
  const { args, cwd } = startArgs({ key: 'wren', folder: '/tmp', home: '/home/crew', kit: '/kit', role: 'you are wren' })
  assert.equal(cwd, '/tmp')
  assert.equal(args[0], '--bg')
  assert.deepEqual(args.slice(args.indexOf('-n'), args.indexOf('-n') + 2), ['-n', 'wren'])
  assert.equal(args[args.indexOf('--model') + 1], MODEL)
  assert.equal(args[args.indexOf('--settings') + 1], NO_REMOTE_SETTINGS)
  assert.equal(JSON.parse(NO_REMOTE_SETTINGS).remoteControlAtStartup, false)
  assert.equal(args[args.indexOf('--append-system-prompt') + 1], 'you are wren')
})

test('a key must be a short lower-case name', () => {
  assert.equal(checkKey('wren'), 'wren')
  assert.throws(() => checkKey('../etc'), /no such person key/)
  assert.throws(() => checkKey('Wren Worker'), /no such person key/)
})

test('parseAgents keeps only entries with an id, and refuses a non-list', () => {
  const list = parseAgents(JSON.stringify([{ id: 'a1', name: 'wren', state: 'idle', status: 'running', startedAt: 5 }, { name: 'no id' }]))
  assert.equal(list.length, 1)
  assert.equal(list[0].id, 'a1')
  assert.equal(parseAgents('not json'), null)
  assert.equal(parseAgents('{"a":1}'), null)
})

test('a recorded id is live only when its own entry is running; a name match alone is not enough', () => {
  const list = [
    { id: 'old', name: 'wren', state: 'ended', status: 'stopped', startedAt: 1 },
    { id: 'new', name: 'wren', state: 'idle', status: 'running', startedAt: 2 }
  ]
  assert.equal(liveById(list, 'old'), null, 'an ended session is not live, even with the same name')
  assert.equal(liveById(list, 'new').id, 'new')
  assert.equal(liveById(list, 'gone'), null)
})

test('the wake plan uses the recorded id only and refuses when that id is not live', () => {
  const list = [{ id: 'other', name: 'wren', state: 'idle', status: 'running', startedAt: 9 }]
  assert.equal(planWake(null, list).ok, false, 'no record, no wake')
  const refused = planWake({ id: 'recorded' }, list)
  assert.equal(refused.ok, false, 'a live session of the same name is not woken in place of the recorded one')
  assert.match(refused.reason, /recorded session recorded is not live/)
  assert.deepEqual(planWake({ id: 'other' }, list), { ok: true, id: 'other' })
})

test('start records the new session id, and a second start while it is live does nothing', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-home-'))
  const kit = HERE
  const first = startSession({ home, kit, key: 'wren', folder: '/tmp', role: 'role text', bin: fake.bin })
  assert.equal(first.ok, true)
  assert.equal(first.started, true)
  assert.equal(readRecord(home, 'wren').id, first.id)
  const bgCall = calls(fake).find(args => args.includes('--bg'))
  assert.ok(bgCall.includes('--settings') && bgCall.includes(NO_REMOTE_SETTINGS), 'the start turned remote control off')

  const second = startSession({ home, kit, key: 'wren', folder: '/tmp', role: 'role text', bin: fake.bin })
  assert.equal(second.started, false)
  assert.equal(second.note, 'already running')
  assert.equal(calls(fake).filter(args => args.includes('--bg')).length, 1, 'no second session was started')
})

test('status and list read the recorded id, and report a session that was stopped as not live', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-home-'))
  const started = startSession({ home, kit: HERE, key: 'wick', folder: '/tmp', role: 'r', bin: fake.bin })
  assert.equal(sessionStatus({ home, key: 'wick', bin: fake.bin }).live, true)
  assert.equal(sessionStatus({ home, key: 'wren', bin: fake.bin }).recorded, false)
  assert.equal(sessionList({ home, bin: fake.bin }).length, 1)

  const stopped = stopSession({ home, key: 'wick', bin: fake.bin })
  assert.equal(stopped.ok, true)
  assert.equal(stopped.id, started.id)
  const after = sessionStatus({ home, key: 'wick', bin: fake.bin })
  assert.equal(after.live, false, 'after the stop the recorded id is not live')
  assert.match(after.line, /not live/)
})

test('a start that claude refuses is reported with its reason, and nothing is recorded', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-home-'))
  const broken = join(fake.dir, 'broken')
  writeFileSync(broken, '#!/bin/sh\necho refused >&2\nexit 3\n')
  chmodSync(broken, 0o755)
  const out = startSession({ home, kit: HERE, key: 'wynn', folder: '/tmp', role: 'r', bin: broken })
  assert.equal(out.ok, false)
  assert.match(out.reason, /refused/)
  assert.equal(readRecord(home, 'wynn'), null)
})
