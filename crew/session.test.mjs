// `crew session` with a fake claude (no real session is started). Run: node --test crew/session.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  startArgs, parseAgents, liveById, planWake, checkKey, startSession, sessionStatus, sessionList, stopSession,
  readRecord, MODEL, mcpConfig, mcpConfigPath, withRules, WORKTREE_RULE, sessionName, crewSlug, confirmResume
} from './session.mjs'
import { settingsPath } from './session-settings.mjs'

// These tests cover the start itself. The trust check before a start has its own tests (claude-trust-session.test.mjs), so here
// the folder is trusted by a stub: the real config file is never touched.
const NO_TRUST = () => ({ ok: true })

// A crew folder for the CLI tests: under a temp base that the home's crew.json names, with a temp Claude config. The CLI start trusts
// that folder there, and nothing real is written.
function crewCli(home) {
  const base = mkdtempSync(join(tmpdir(), 'session-cli-base-'))
  const folder = join(base, 'taskmanager-test-x')
  mkdirSync(folder)
  writeFileSync(join(home, 'crew.json'), `${JSON.stringify({ worktreeBase: base })}\n`)
  return { folder, env: { CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'session-cli-cfg-')) } }
}

test('a session starts with strict mcp config, and that config holds only the crew taskmanager entry', () => {
  const home = mkdtempSync(join(tmpdir(), 'session-mcp-'))
  const { args } = startArgs({ key: 'wren', folder: '/tmp', home, kit: '/kit', role: 'r' })
  assert.ok(args.includes('--strict-mcp-config'), 'only the mcp config the session is given, no connectors')
  assert.equal(args[args.indexOf('--mcp-config') + 1], mcpConfigPath(home, 'wren'))
  const cfg = mcpConfig({ key: 'wren', home, kit: '/kit' })
  assert.deepEqual(Object.keys(cfg.mcpServers), ['taskmanager-crew'], 'exactly one server, the crew one')
  const entry = cfg.mcpServers['taskmanager-crew']
  assert.deepEqual(entry.args, ['/kit/channel.mjs', 'wren'])
  assert.equal(entry.env.CREW_HOME, home)
  assert.ok(!JSON.stringify(cfg).toLowerCase().includes('apikey'), 'no key goes into the config')
})

test('the worktree rule is the last line of the role the session gets, and the role keeps its text', () => {
  const prompt = withRules('You are Wren.\nWork on your card.')
  assert.match(prompt, /You are Wren\.\nWork on your card\./)
  assert.equal(prompt.trimEnd().split('\n').at(-1), WORKTREE_RULE)
  assert.match(WORKTREE_RULE, /Work only in the worktree you were started in, never create your own\./)
  const { args } = startArgs({ key: 'wren', folder: '/tmp', home: '/h', kit: '/k', role: 'You are Wren.' })
  assert.equal(args[args.indexOf('--append-system-prompt') + 1].trimEnd().split('\n').at(-1), WORKTREE_RULE)
})

test('a start writes the session mcp config file before it runs claude', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-home-'))
  const out = startSession({ home, kit: HERE, key: 'wren', folder: '/tmp', role: 'r', bin: fake.bin, trust: NO_TRUST })
  assert.equal(out.ok, true)
  assert.ok(existsSync(mcpConfigPath(home, 'wren')))
  const cfg = JSON.parse(readFileSync(mcpConfigPath(home, 'wren'), 'utf8'))
  assert.deepEqual(Object.keys(cfg.mcpServers), ['taskmanager-crew'])
})

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
// Job records, as claude keeps them in ~/.claude/jobs/<short id>/state.json (the short id is the job's folder name).
const JOBS = ${JSON.stringify(join(dir, 'jobs'))}
const writeJob = (short, job) => {
  fs.mkdirSync(JOBS + '/' + short, { recursive: true })
  fs.writeFileSync(JOBS + '/' + short + '/state.json', JSON.stringify(job))
}
const jobRecords = () => fs.existsSync(JOBS) ? fs.readdirSync(JOBS).flatMap(d => {
  try { const j = JSON.parse(fs.readFileSync(JOBS + '/' + d + '/state.json', 'utf8')); return j.state === 'failed' ? [] : [j] } catch { return [] }
}) : []
if (args.includes('--bg') && args.includes('--resume')) {
  // claude --bg --resume <id>, bare: the same session under the same id when claude knows the session (listed, or with a job
  // record that is not failed; it keeps the session's name). An unknown id is not refused by claude: it leaves a failed job (exit 0).
  const id = args[args.indexOf('--resume') + 1]
  const short = id.slice(0, 8)
  const job = list.find(a => a.sessionId === id) ? null : jobRecords().find(j => j.sessionId === id)
  const hit = list.find(a => a.sessionId === id) ?? (job ? { id: short, sessionId: id, name: job.name, startedAt: Date.now() } : null)
  if (!hit) {
    writeJob(short, { state: 'failed', detail: 'source session ' + id + ' not found', sessionId: id })
    list.push({ id: short, sessionId: id, name: short, state: 'blocked', status: 'blocked', startedAt: Date.now() })
    fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify(list))
    process.stdout.write('backgrounded · ' + short + '\\n'); process.exit(0)
  }
  const entry = list.find(a => a.sessionId === id)
  if (entry) { entry.state = 'working'; entry.status = 'busy' } else list.push({ id: hit.id, sessionId: id, name: hit.name, state: 'working', status: 'busy', startedAt: hit.startedAt })
  writeJob(short, { state: 'working', detail: '', sessionId: id, name: hit.name })
  fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify(list))
  process.stdout.write(id + '\\n'); process.exit(0)
}
if (args.includes('--bg')) {
  const name = args[args.indexOf('-n') + 1]
  const id = (0xa0000001 + list.length).toString(16)
  const sessionId = id + '-1111-4222-8333-' + String(list.length).padStart(12, '0')
  list.push({ id, sessionId, name, state: 'idle', status: 'running', startedAt: Date.now() + list.length })
  writeJob(id, { state: 'working', detail: '', sessionId, name })
  fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify(list))
  process.stdout.write(sessionId + '\\n'); process.exit(0)
}
if (args[0] === 'stop') {
  // Like claude: stop takes the short id that agents shows (id); the full sessionId is refused.
  const hit = list.find(a => a.id === args[1])
  if (!hit) { process.stderr.write('no such session'); process.exit(1) }
  hit.state = 'ended'
  writeJob(hit.id, { state: 'stopped', detail: 'stopped', sessionId: hit.sessionId, name: hit.name })
  fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify(list))
  process.exit(0)
}
process.exit(2)
`)
  chmodSync(bin, 0o755)
  return { bin, state, log, dir, jobs: join(dir, 'jobs') }
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
  // The start passes the person's own settings file, not an inline string (card mwf45rzxf8z9wtv9nv).
  assert.equal(args[args.indexOf('--settings') + 1], settingsPath('/home/crew', 'wren'))
  assert.match(args[args.indexOf('--append-system-prompt') + 1], /^you are wren\n/)
})

test('a key must be a short lower-case name', () => {
  assert.equal(checkKey('wren'), 'wren')
  assert.throws(() => checkKey('../etc'), /no such person key/)
  assert.throws(() => checkKey('Wren Worker'), /no such person key/)
})

test('parseAgents keeps only entries with an id, and refuses a non-list', () => {
  const list = parseAgents(JSON.stringify([{ id: 'a1b2c3d4', name: 'wren', state: 'idle', status: 'running', startedAt: 5 }, { name: 'no id' }]))
  assert.equal(list.length, 1)
  assert.equal(list[0].id, 'a1b2c3d4')
  assert.equal(parseAgents('not json'), null)
  assert.equal(parseAgents('{"a":1}'), null)
})

test('a recorded id is live only when its own entry is running; a name match alone is not enough', () => {
  const list = [
    { id: 'aa000001', name: 'wren', state: 'ended', status: 'stopped', startedAt: 1 },
    { id: 'bb000002', name: 'wren', state: 'idle', status: 'running', startedAt: 2 }
  ]
  assert.equal(liveById(list, 'aa000001'), null, 'an ended session is not live, even with the same name')
  assert.equal(liveById(list, 'bb000002').id, 'bb000002')
  assert.equal(liveById(list, 'cc000003'), null)
})

test('the wake plan uses the recorded id only and refuses when that id is not live', () => {
  const list = [{ id: 'dd000004', name: 'wren', state: 'idle', status: 'running', startedAt: 9 }]
  assert.equal(planWake(null, list).ok, false, 'no record, no wake')
  const refused = planWake({ id: 'ee000005' }, list)
  assert.equal(refused.ok, false, 'a live session of the same name is not woken in place of the recorded one')
  assert.match(refused.reason, /recorded session ee000005 is not live/)
  assert.deepEqual(planWake({ id: 'dd000004' }, list), { ok: true, id: 'dd000004' })
})

test('start records the new session id, and a second start while it is live does nothing', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-home-'))
  const kit = HERE
  const first = startSession({ home, kit, key: 'wren', folder: '/tmp', role: 'role text', bin: fake.bin, trust: NO_TRUST })
  assert.equal(first.ok, true)
  assert.equal(first.started, true)
  assert.equal(readRecord(home, 'wren').id, first.id)
  const bgCall = calls(fake).find(args => args.includes('--bg'))
  assert.ok(bgCall.includes('--settings') && bgCall.includes(settingsPath(home, 'wren')), 'the start passes the person settings file')
  const file = JSON.parse(readFileSync(settingsPath(home, 'wren'), 'utf8'))
  assert.equal(file.remoteControlAtStartup, false, 'remote control is off in the file the start passes')

  const second = startSession({ home, kit, key: 'wren', folder: '/tmp', role: 'role text', bin: fake.bin, trust: NO_TRUST })
  assert.equal(second.started, false)
  assert.equal(second.note, 'already running')
  assert.equal(calls(fake).filter(args => args.includes('--bg')).length, 1, 'no second session was started')
})

test('status and list read the recorded id, and report a session that was stopped as not live', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-home-'))
  const started = startSession({ home, kit: HERE, key: 'wick', folder: '/tmp', role: 'r', bin: fake.bin, trust: NO_TRUST })
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

test('stop passes claude the short id that agents shows, not the full session id (claude stop refuses the full one)', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-home-'))
  const started = startSession({ home, kit: HERE, key: 'wick', folder: '/tmp', role: 'r', bin: fake.bin, trust: NO_TRUST })
  const stopped = stopSession({ home, key: 'wick', bin: fake.bin })
  assert.equal(stopped.ok, true, stopped.reason)
  const stopCall = calls(fake).find(args => args[0] === 'stop')
  assert.deepEqual(stopCall, ['stop', started.id.slice(0, 8)])
})

test('a start that claude refuses is reported with its reason, and nothing is recorded', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-home-'))
  const broken = join(fake.dir, 'broken')
  writeFileSync(broken, '#!/bin/sh\necho refused >&2\nexit 3\n')
  chmodSync(broken, 0o755)
  const out = startSession({ home, kit: HERE, key: 'wynn', folder: '/tmp', role: 'r', bin: broken, trust: NO_TRUST })
  assert.equal(out.ok, false)
  assert.match(out.reason, /refused/)
  assert.equal(readRecord(home, 'wynn'), null)
})

// `crew session start <key>` with no CREW_ROLE_FILE: the start reads sessions/<key>.role.md, so a person without a worker
// section in PROMPTS.md (Nina, Pat, Quincy) starts with the file's text.
test('crew session start reads the role file of the key when CREW_ROLE_FILE is not set', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-cli-home-'))
  mkdirSync(join(home, 'sessions'), { recursive: true })
  writeFileSync(join(home, 'sessions', 'nina.role.md'), 'NINA CLI ROLE MARKER\n')
  const env = { ...process.env, CREW_HOME: home, CREW_CLAUDE_BIN: fake.bin }
  delete env.CREW_ROLE_FILE
  const crew = crewCli(home)
  const run = spawnSync(process.execPath, [join(HERE, 'session.mjs'), 'start', 'nina', crew.folder], { encoding: 'utf8', env: { ...env, ...crew.env } })
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const start = calls(fake).find(args => args.includes('--bg'))
  assert.ok(start, 'claude --bg was run')
  assert.match(start[start.indexOf('--append-system-prompt') + 1], /NINA CLI ROLE MARKER/)
})

// The same rule as `crew up`: a worker's start rebuilds the role from PROMPTS.md, so a stale role file cannot win.
test('crew session start rebuilds a worker role from PROMPTS.md over a stale role file', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-cli-worker-'))
  mkdirSync(join(home, 'sessions'), { recursive: true })
  writeFileSync(join(home, 'PROMPTS.md'), '## Worker (key `W`, chat nick `NICK`)\n\n```\nFRESH PROMPT MARKER for W\n```\n')
  writeFileSync(join(home, 'sessions', 'wynn.role.md'), 'STALE ROLE MARKER\n')
  const env = { ...process.env, CREW_HOME: home, CREW_CLAUDE_BIN: fake.bin }
  delete env.CREW_ROLE_FILE
  const crew = crewCli(home)
  const run = spawnSync(process.execPath, [join(HERE, 'session.mjs'), 'start', 'wynn', crew.folder], { encoding: 'utf8', env: { ...env, ...crew.env } })
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const start = calls(fake).find(args => args.includes('--bg'))
  const role = start[start.indexOf('--append-system-prompt') + 1]
  assert.match(role, /FRESH PROMPT MARKER for wynn/)
  assert.doesNotMatch(role, /STALE ROLE MARKER/)
  assert.match(readFileSync(join(home, 'sessions', 'wynn.role.md'), 'utf8'), /FRESH PROMPT MARKER for wynn/, 'the role file is rebuilt')
})

// A key that is not a plain name names no file: refused before any claude call, so no path is read or sent to claude.
test('crew session start refuses a key that is not a plain name, and runs nothing', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-cli-bad-'))
  mkdirSync(join(home, 'sessions'), { recursive: true })
  writeFileSync(join(home, 'sessions', 'x.role.md'), 'TRAVERSAL MARKER\n')
  const env = { ...process.env, CREW_HOME: home, CREW_CLAUDE_BIN: fake.bin }
  delete env.CREW_ROLE_FILE
  const run = spawnSync(process.execPath, [join(HERE, 'session.mjs'), 'start', '../x', '/tmp'], { encoding: 'utf8', env })
  assert.equal(run.status, 1)
  assert.match(run.stdout, /no such person key|no role/)
  assert.equal(existsSync(fake.log) ? calls(fake).length : 0, 0, 'claude was not run')
})

// `status` and `list` only read: a worker with no role file gets none written by a status call.
test('crew session status writes no role file', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-cli-status-'))
  mkdirSync(join(home, 'sessions'), { recursive: true })
  writeFileSync(join(home, 'PROMPTS.md'), '## Worker (key `W`, chat nick `NICK`)\n\n```\nSTATUS PROMPT for W\n```\n')
  const env = { ...process.env, CREW_HOME: home, CREW_CLAUDE_BIN: fake.bin }
  delete env.CREW_ROLE_FILE
  spawnSync(process.execPath, [join(HERE, 'session.mjs'), 'status', 'wynn'], { encoding: 'utf8', env })
  assert.equal(existsSync(join(home, 'sessions', 'wynn.role.md')), false, 'no role file from a status call')
})

// Named sessions (card mwmh94f2959efe5zi9v): every person's session is named <crew slug>-<key>, so `claude --resume <name>` works.
test('sessionName is the crew slug and the key, joined with a dash; no slug gives the key alone', () => {
  assert.equal(sessionName({ slug: 'taskmanager-maintenance', key: 'wren' }), 'taskmanager-maintenance-wren')
  assert.equal(sessionName({ slug: '', key: 'wren' }), 'wren')
  assert.throws(() => sessionName({ slug: 'acme', key: '../x' }), /no such person key/)
})

test('crewSlug reads the crew slug from crew.json, else the team name slugged, else nothing', () => {
  const home = mkdtempSync(join(tmpdir(), 'session-slug-'))
  assert.equal(crewSlug(home), '', 'no crew.json, no slug')
  writeFileSync(join(home, 'crew.json'), `${JSON.stringify({ team: 'Taskmanager Maintenance' })}\n`)
  assert.equal(crewSlug(home), 'taskmanager-maintenance', 'the team name, slugged')
  writeFileSync(join(home, 'crew.json'), `${JSON.stringify({ team: 'Taskmanager Maintenance', crew: { slug: 'acme-crew' } })}\n`)
  assert.equal(crewSlug(home), 'acme-crew', 'the crew slug wins over the team name')
})

test('the start argv names the session with the name it is given, and resumes a recorded id only when one is given', () => {
  const named = startArgs({ key: 'wren', folder: '/tmp', home: '/h', kit: '/k', role: 'r', name: 'acme-wren' })
  assert.deepEqual(named.args.slice(named.args.indexOf('-n'), named.args.indexOf('-n') + 2), ['-n', 'acme-wren'])
  assert.equal(named.args.includes('--resume'), false, 'no resume without a recorded id')
  const resumed = startArgs({ key: 'wren', folder: '/tmp', home: '/h', kit: '/k', role: 'r', name: 'acme-wren', resume: 'a1b2c3d4' })
  assert.equal(resumed.args[0], '--bg')
  assert.deepEqual(resumed.args.slice(resumed.args.indexOf('--resume'), resumed.args.indexOf('--resume') + 2), ['--resume', 'a1b2c3d4'])
  assert.throws(() => startArgs({ key: 'wren', folder: '/tmp', home: '/h', kit: '/k', role: 'r', resume: 'x; rm -rf /' }), /session id/)
})

test('a start gives the session its first prompt as the first argument after --bg, so it takes one turn and idles', () => {
  const fresh = startArgs({ key: 'wren', folder: '/tmp', home: '/h', kit: '/k', role: 'r' })
  assert.equal(fresh.args[0], '--bg')
  assert.equal(typeof fresh.args[1], 'string')
  assert.ok(fresh.args[1].length > 0 && !fresh.args[1].startsWith('-'), 'the prompt is text, not a flag')
  const given = startArgs({ key: 'wren', folder: '/tmp', home: '/h', kit: '/k', role: 'r', prompt: 'check your mail' })
  assert.deepEqual(given.args.slice(0, 2), ['--bg', 'check your mail'])
  // A resume passes no flags and no prompt: claude keeps the session's saved options, and any flag makes a copy under a new id
  // (checked 2026-11-19: `claude --bg --resume <id> -n ...` started 7b34828e; the bare `claude --bg --resume <id>` woke 61c5977d).
  const resumed = startArgs({ key: 'wren', folder: '/tmp', home: '/h', kit: '/k', role: 'r', resume: 'a1b2c3d4' })
  assert.deepEqual(resumed.args, ['--bg', '--resume', 'a1b2c3d4'], 'a resume is the bare form, with no flags that would start a copy')
})

test('a start names the session <crew slug>-<key> and finds the new session by that name', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-named-'))
  writeFileSync(join(home, 'crew.json'), `${JSON.stringify({ team: 'Acme Team' })}\n`)
  const out = startSession({ home, kit: HERE, key: 'wren', folder: '/tmp', role: 'r', bin: fake.bin, trust: NO_TRUST })
  assert.equal(out.ok, true)
  const bg = calls(fake).find(args => args.includes('--bg'))
  assert.deepEqual(bg.slice(bg.indexOf('-n'), bg.indexOf('-n') + 2), ['-n', 'acme-team-wren'])
  assert.equal(readRecord(home, 'wren').id, out.id, 'the id of the session with that name is recorded')
})

test('crew up resumes a stopped session by its recorded id: same id, resumed, and no new session', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-resume-'))
  const first = startSession({ home, kit: HERE, key: 'wick', folder: '/tmp', role: 'r', bin: fake.bin, trust: NO_TRUST })
  stopSession({ home, key: 'wick', bin: fake.bin })
  assert.equal(sessionStatus({ home, key: 'wick', bin: fake.bin }).live, false)
  const again = startSession({ home, kit: HERE, key: 'wick', folder: '/tmp', role: 'r', bin: fake.bin, trust: NO_TRUST })
  assert.equal(again.ok, true)
  assert.equal(again.started, true)
  assert.equal(again.resumed, true)
  assert.equal(again.id, first.id, 'the same session id, so the transcript comes back with it')
  const last = calls(fake).filter(args => args.includes('--bg')).at(-1)
  assert.deepEqual(last.slice(last.indexOf('--resume'), last.indexOf('--resume') + 2), ['--resume', first.id])
  assert.equal(readRecord(home, 'wick').id, first.id)
  assert.equal(sessionStatus({ home, key: 'wick', bin: fake.bin }).live, true)
})

// Claude does not refuse an unknown id: it leaves a failed job (exit 0). The kit reads that job, says so, and starts nothing.
test('a resume that claude refuses (an unknown id: a failed job) is reported as refused, and nothing is started fresh', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-fallback-'))
  mkdirSync(join(home, 'sessions'), { recursive: true })
  const gone = '0a1b2c3d-1111-4222-8333-444455556666'
  writeFileSync(join(home, 'sessions', 'wynn.json'), `${JSON.stringify({ id: gone, name: 'wynn', folder: '/tmp' })}\n`)
  const out = startSession({ home, kit: HERE, key: 'wynn', folder: '/tmp', role: 'r', bin: fake.bin, trust: NO_TRUST, jobs: fake.jobs, confirmMs: 0 })
  assert.equal(out.ok, false)
  assert.equal(out.reason, `resume refused: source session ${gone} not found`, 'the job detail is the reason')
  assert.equal(out.started, undefined, 'never reported as started')
  const bgCalls = calls(fake).filter(args => args.includes('--bg'))
  assert.equal(bgCalls.length, 1, 'the one resume was tried, and no fresh start followed')
  assert.equal(readRecord(home, 'wynn').id, gone, 'the record keeps the id it had')
})

test('a short-id record of a stopped session resumes: agents does not list it, so the full id comes from its job record', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-short-stopped-'))
  const first = startSession({ home, kit: HERE, key: 'wick', folder: '/tmp', role: 'r', bin: fake.bin, trust: NO_TRUST, jobs: fake.jobs })
  stopSession({ home, key: 'wick', bin: fake.bin })
  // Claude agents no longer lists the stopped session.
  writeFileSync(fake.state, JSON.stringify(JSON.parse(readFileSync(fake.state, 'utf8')).filter(a => a.sessionId !== first.id)))
  writeFileSync(join(home, 'sessions', 'wick.json'), `${JSON.stringify({ id: first.id.slice(0, 8), name: 'wick', folder: '/tmp' })}\n`)
  const again = startSession({ home, kit: HERE, key: 'wick', folder: '/tmp', role: 'r', bin: fake.bin, trust: NO_TRUST, jobs: fake.jobs })
  assert.equal(again.ok, true, again.reason)
  assert.equal(again.resumed, true)
  assert.equal(again.id, first.id, 'the full id, from the job record')
  assert.deepEqual(calls(fake).filter(args => args.includes('--bg')).at(-1), ['--bg', '--resume', first.id], 'the bare resume, with the full id')
  assert.equal(readRecord(home, 'wick').id, first.id, 'the record now holds the full id')
})

// Card mwmm84ij7xux7aaq7a3: `claude agents --json` gives a background session a short id (8 characters) and its full sessionId.
// Resume needs the full sessionId; the record must hold that, or every resume falls back to a fresh start with a new id.
test('a start records the full sessionId, and a resume uses it: same session, no new id', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-full-id-'))
  const first = startSession({ home, kit: HERE, key: 'wade', folder: '/tmp', role: 'r', bin: fake.bin, trust: NO_TRUST })
  assert.equal(first.ok, true)
  assert.match(first.id, /^[0-9a-f]{8}-[0-9a-f-]+$/, 'the recorded id is the full sessionId, not the short one')
  assert.equal(readRecord(home, 'wade').id, first.id)
  stopSession({ home, key: 'wade', bin: fake.bin })
  const again = startSession({ home, kit: HERE, key: 'wade', folder: '/tmp', role: 'r', bin: fake.bin, trust: NO_TRUST })
  assert.equal(again.resumed, true, 'claude took the resume')
  assert.equal(again.resumeRefused, undefined, 'no refusal to report')
  assert.equal(again.id, first.id)
  const last = calls(fake).filter(args => args.includes('--bg')).at(-1)
  assert.equal(last[last.indexOf('--resume') + 1], first.id)
})

test('a record holding the short id (written before this fix) resumes the full sessionId that agents lists for it', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-old-record-'))
  const first = startSession({ home, kit: HERE, key: 'wren', folder: '/tmp', role: 'r', bin: fake.bin, trust: NO_TRUST })
  const short = first.id.slice(0, 8)
  writeFileSync(join(home, 'sessions', 'wren.json'), `${JSON.stringify({ id: short, name: 'wren', folder: '/tmp' })}\n`)
  stopSession({ home, key: 'wren', bin: fake.bin })
  const again = startSession({ home, kit: HERE, key: 'wren', folder: '/tmp', role: 'r', bin: fake.bin, trust: NO_TRUST })
  assert.equal(again.resumed, true)
  assert.equal(again.id, first.id)
  const last = calls(fake).filter(args => args.includes('--bg')).at(-1)
  assert.equal(last[last.indexOf('--resume') + 1], first.id, 'resumed with the full id, not the short one')
})

// Real claude (checked 2026-11-19): an unknown id is listed as a working job named by its short id for about 20 s, then its job
// fails. So a job that is not failed yet proves nothing: the resume counts only when the listed session keeps the person's name.
test('confirmResume: a working entry named by its short id (an unknown id, not yet failed) is not a resume; the session name is', () => {
  const fake = fakeClaude()
  const id = 'a1b2c3d4-0000-4000-8000-00000000abcd'
  writeFileSync(fake.state, JSON.stringify([{ id: id.slice(0, 8), sessionId: id, name: id.slice(0, 8), state: 'working', status: 'busy', startedAt: 1 }]))
  const notYet = confirmResume({ bin: fake.bin, jobs: fake.jobs, resumeId: id, name: 'wick', confirmMs: 0, sleep: () => {} })
  assert.equal(notYet.ok, false)
  assert.match(notYet.detail, /did not come back as wick/)
  writeFileSync(fake.state, JSON.stringify([{ id: id.slice(0, 8), sessionId: id, name: 'wick', state: 'working', status: 'busy', startedAt: 1 }]))
  assert.equal(confirmResume({ bin: fake.bin, jobs: fake.jobs, resumeId: id, name: 'wick', confirmMs: 0, sleep: () => {} }).ok, true)
})

// The CLI's words: a resume says "resumed" (never "started"), and a refused resume exits 1 with the job's detail.
test('crew session start says "resumed" for a resume, and a refused resume exits 1 with its reason', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-cli-resume-'))
  mkdirSync(join(home, 'sessions'), { recursive: true })
  writeFileSync(join(home, 'sessions', 'nina.role.md'), 'NINA CLI RESUME ROLE\n')
  const crew = crewCli(home)
  const env = { ...process.env, CREW_HOME: home, CREW_CLAUDE_BIN: fake.bin, CREW_JOBS_DIR: fake.jobs, ...crew.env }
  delete env.CREW_ROLE_FILE
  const run = (...argv) => spawnSync(process.execPath, [join(HERE, 'session.mjs'), ...argv], { encoding: 'utf8', env })
  const first = run('start', 'nina', crew.folder)
  assert.equal(first.status, 0, first.stdout + first.stderr)
  assert.match(first.stdout, /nina: session \S+ started/)
  assert.equal(run('stop', 'nina').status, 0)
  const again = run('start', 'nina', crew.folder)
  assert.equal(again.status, 0, again.stdout + again.stderr)
  assert.match(again.stdout, /nina: session \S+ resumed/)
  assert.doesNotMatch(again.stdout, /started/)
  const gone = '0a1b2c3d-1111-4222-8333-444455556666'
  writeFileSync(join(home, 'sessions', 'nina.json'), `${JSON.stringify({ id: gone, name: 'nina', folder: crew.folder })}\n`)
  const refused = run('start', 'nina', crew.folder)
  assert.equal(refused.status, 1)
  assert.match(refused.stdout, new RegExp(`^resume refused: source session ${gone} not found$`, 'm'))
  assert.doesNotMatch(refused.stdout, /started/)
})

test('parseAgents takes the full sessionId as the id and keeps the short one as shortId', () => {
  const list = parseAgents(JSON.stringify([{ id: 'a1b2c3d4', sessionId: 'a1b2c3d4-0000-4000-8000-000000000001', name: 'wade', state: 'idle', status: 'running', startedAt: 5 }]))
  assert.equal(list[0].id, 'a1b2c3d4-0000-4000-8000-000000000001')
  assert.equal(list[0].shortId, 'a1b2c3d4')
  assert.equal(liveById(list, 'a1b2c3d4').id, list[0].id, 'the short id still finds its live entry')
})

// `crew up` and `crew restart` resume only (card mwmzv2jt): a resume that claude refuses is reported, never followed by a fresh start.
test('resumeOnly: a refused resume is reported with its reason, and no fresh session is started', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-resume-only-'))
  mkdirSync(join(home, 'sessions'), { recursive: true })
  const gone = '0a1b2c3d-1111-4222-8333-444455556666'
  writeFileSync(join(home, 'sessions', 'wynn.json'), `${JSON.stringify({ id: gone, name: 'wynn', folder: '/tmp' })}\n`)
  const out = startSession({ home, kit: HERE, key: 'wynn', folder: '/tmp', role: 'r', bin: fake.bin, trust: NO_TRUST, resumeOnly: true, jobs: fake.jobs, confirmMs: 0 })
  assert.equal(out.ok, false)
  assert.equal(out.reason, `resume refused: source session ${gone} not found`)
  const bgCalls = calls(fake).filter(args => args.includes('--bg'))
  assert.equal(bgCalls.length, 1, 'the resume was tried once, and nothing else was started')
  assert.ok(bgCalls[0].includes('--resume'))
  assert.equal(readRecord(home, 'wynn').id, gone, 'the recorded id is kept, not replaced')
})

test('resumeOnly: a person with no recorded session id is refused, not started fresh', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-resume-none-'))
  const out = startSession({ home, kit: HERE, key: 'wren', folder: '/tmp', role: 'r', bin: fake.bin, trust: NO_TRUST, resumeOnly: true })
  assert.equal(out.ok, false)
  assert.match(out.reason, /no recorded session id to resume/)
  assert.equal(calls(fake).filter(args => args.includes('--bg')).length, 0)
})

test('resumeOnly: a recorded id that is live is still "already running" and nothing is started', () => {
  const fake = fakeClaude()
  const home = mkdtempSync(join(tmpdir(), 'session-resume-live-'))
  const first = startSession({ home, kit: HERE, key: 'wick', folder: '/tmp', role: 'r', bin: fake.bin, trust: NO_TRUST })
  const again = startSession({ home, kit: HERE, key: 'wick', folder: '/tmp', role: 'r', bin: fake.bin, trust: NO_TRUST, resumeOnly: true })
  assert.equal(again.ok, true)
  assert.equal(again.started, false)
  assert.equal(again.id, first.id)
})
