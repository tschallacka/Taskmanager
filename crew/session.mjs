#!/usr/bin/env node
// `crew session`: a person as its own background session (card mwdblb506deyxnet5i7). Remote control is off per session.
// The session is recorded by its id (CREW_HOME/sessions/<key>.json), and everything after the start finds it by that id,
// never by name alone. Commands:
//   crew session start <key> <folder>   starts claude --bg for the person, records its id (no-op when it is live)
//   crew session status <key>           the recorded id and whether that id is live
//   crew session list                   every recorded session and whether it is live
//   crew session stop <key>             stops the recorded session
// The start puts the role (the person's section of PROMPTS.md and CREW.md) in as the system prompt, from ROLE_FILE.
// Tests use a fake claude (crew/session.test.mjs). No real session is started by the tests.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { crewHome, crewSlugOf, sessionNameFor } from './home.mjs'
import { longRunEnv, settingsPath, writeSettingsFile } from './session-settings.mjs'
import { notTrustedReason, readWorktreeBase, recordedFolders, trustForStart } from './claude-trust.mjs'
import { resolveStartRole, writeRoleFile } from './role-file.mjs'

export const MODEL = 'claude-haiku-5-5'
// The first prompt of every start: one turn, then the session idles and waits for mail (card mwmyu740mc2d4raspoj).
export const FIRST_PROMPT = 'You are awake. Read your role and your card, then wait for mail.'
export const NO_REMOTE_SETTINGS = JSON.stringify({ remoteControlAtStartup: false })
const KEY = /^[a-z][a-z0-9-]{0,31}$/
// A session id as claude gives it: hex, in one piece or in UUID groups. It is typed into a shell command (session-wake.sh
// runs `claude attach <id>`), so nothing else is let through: a shell metacharacter in an id would run a command.
const SESSION_ID = /^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4,12}){0,4}$/

export function validSessionId(id) {
  return typeof id === 'string' && SESSION_ID.test(id)
}

export function checkKey(key) {
  if (!KEY.test(String(key ?? ''))) throw new Error(`no such person key: ${key}`)
  return key
}

export function recordPath(home, key) {
  return join(home, 'sessions', `${checkKey(key)}.json`)
}

export function readRecord(home, key) {
  const path = recordPath(home, key)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

export function writeRecord(home, key, record) {
  mkdirSync(join(home, 'sessions'), { recursive: true })
  writeFileSync(recordPath(home, key), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
}

/** The line every worker role gets (Boss, 2026-11-13: Wren's session created a worktree inside the main checkout). */
export const WORKTREE_RULE = 'Work only in the worktree you were started in, never create your own. Do not create a worktree, and do not enter one, anywhere else.'

/** The role with the standing rules added: the worktree rule is always the last line of the system prompt. */
export function withRules(role) {
  return `${String(role ?? '').trimEnd()}\n\n${WORKTREE_RULE}\n`
}

/**
 * The mcp config for one session: only the crew's own taskmanager entry (the channel server for this person), so a
 * session can never reach a connector. No key is in it: the channel reads creds.json.
 */
export function mcpConfig({ key, home, kit }) {
  return {
    mcpServers: {
      'taskmanager-crew': {
        command: 'node',
        args: [join(kit, 'channel.mjs'), checkKey(key)],
        env: { CREW_HOME: home }
      }
    }
  }
}

export function mcpConfigPath(home, key) {
  return join(home, 'sessions', `${checkKey(key)}.mcp.json`)
}

/**
 * The crew's slug, read from crew.json (or the older crew.config.json), as home.mjs crewSlugOf gives it. '' when the home has
 * no readable crew file.
 */
export function crewSlug(home) {
  const file = [join(home, 'crew.json'), join(home, 'crew.config.json')].find(f => existsSync(f))
  if (!file) return ''
  try {
    return crewSlugOf(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return ''
  }
}

/** A person's session name (home.mjs sessionNameFor), after the key is checked. */
export function sessionName({ slug, key }) {
  checkKey(key)
  return sessionNameFor(slug, key)
}

/**
 * The argv of `claude --bg` for one person (not run here). The role goes in as the system prompt, from the file. With a
 * `resume` session id, the argv continues that session under the same id (`claude --bg <prompt> --resume <id>`).
 * The first prompt is the first argument after `--bg`: a fresh session takes that one turn and then idles, ready for mail.
 */
export function startArgs({ key, folder, home, kit, role, model = MODEL, name = checkKey(key), resume = '', prompt = FIRST_PROMPT }) {
  // The id is typed into the argv of a process, so it must be a session id (see SESSION_ID).
  if (resume && !validSessionId(resume)) throw new Error(`not a session id: ${resume}`)
  // A resume is the bare form: claude keeps the session's saved options, and any other flag starts a copy under a new id.
  if (resume) return { cwd: folder, args: ['--bg', '--resume', resume] }
  return {
    cwd: folder,
    args: [
      '--bg', prompt, ...(resume ? ['--resume', resume] : []), '-n', name, '--model', model,
      '--setting-sources', 'user', '--settings', settingsPath(home, key),
      '--strict-mcp-config', '--mcp-config', mcpConfigPath(home, key),
      '--permission-mode', 'auto',
      '--add-dir', home, '--add-dir', kit,
      '--append-system-prompt', withRules(role)
    ]
  }
}

/**
 * The sessions `claude agents --json` lists, as { id, shortId, name, state, status, startedAt }. A background session has a short
 * `id` (8 characters) and a full `sessionId`; the id here is the full one, because `claude --resume` needs it. Anything else is dropped.
 */
export function parseAgents(json) {
  let list
  try {
    list = JSON.parse(json)
  } catch {
    return null
  }
  if (!Array.isArray(list)) return null
  return list
    .filter(a => a && (validSessionId(a.sessionId) || validSessionId(a.id)))
    .map(a => ({
      id: validSessionId(a.sessionId) ? a.sessionId : a.id,
      shortId: validSessionId(a.id) ? a.id : '',
      name: a.name ?? '', state: a.state ?? '', status: a.status ?? '', startedAt: Number(a.startedAt) || 0
    }))
}

/** The live entry for a recorded id, or null. Matched by id (full or short) only; the name is never used to find a live session here. */
export function liveById(list, id) {
  if (!Array.isArray(list) || !validSessionId(id)) return null
  const hit = list.find(a => a.id === id || (a.shortId && a.shortId === id))
  if (!hit || hit.state === 'ended' || hit.status === 'stopped') return null
  return hit
}

/** The wake plan: which recorded id to wake, or why not. The wake itself is sent by the caller, never by name. */
export function planWake(record, list) {
  if (!record?.id) return { ok: false, reason: 'no recorded session for this person; start it with crew session start' }
  if (!liveById(list, record.id)) return { ok: false, reason: `recorded session ${record.id} is not live; start it again with crew session start` }
  return { ok: true, id: record.id }
}

/** Runs claude with the given argv. `bin` is the claude binary (the fake one in tests). */
export function runClaude(args, { bin = 'claude', cwd, timeout = 60000 } = {}) {
  const run = spawnSync(bin, args, { encoding: 'utf8', cwd, timeout })
  return { ok: run.status === 0, status: run.status, stdout: run.stdout ?? '', stderr: (run.stderr ?? '').trim() }
}

export function listAgents(opts = {}) {
  const run = runClaude(['agents', '--json'], opts)
  return run.ok ? parseAgents(run.stdout) : null
}

/**
 * Starts the person's session, unless the recorded one is live. A recorded session that is not live is resumed (the same id, the
 * same transcript), and a refused resume is an error: `resume refused: <detail>`, never a fresh start. A record with no id starts
 * a fresh session and records its id. Before the start, the crew's own folders are trusted in Claude Code's config (`trust`,
 * claude-trust.mjs); a folder the crew did not make is refused with a sentence that says what crew update does.
 */
export function startSession({ home, kit, key, folder, role, bin, now = Date.now, trust = trustForStart, resumeOnly = false, jobs, confirmMs = RESUME_CONFIRM_MS }) {
  checkKey(key)
  if (!folder || !existsSync(folder)) return { ok: false, reason: `the folder for ${key} does not exist: ${folder ?? '(none)'}` }
  const list = listAgents({ bin })
  const record = readRecord(home, key)
  if (list && liveById(list, record?.id)) return { ok: true, id: record.id, started: false, note: 'already running' }
  // resumeOnly (crew up, crew restart, card mwmzv2jt): the recorded session is the only one that may start. Without a recorded id
  // there is nothing to resume, and a refused resume is reported, never followed by a fresh start.
  if (resumeOnly && !validSessionId(record?.id)) return { ok: false, reason: `${key}: no recorded session id to resume; not started fresh` }
  const trusted = trust({ home, kit, folder, folders: recordedFolders(home) })
  if (!trusted.ok) return { ok: false, reason: trusted.reason }
  const name = sessionName({ slug: crewSlug(home), key })
  // The session's own mcp config, written before the start, so the strict flag always has a file to read.
  // Applies to a FRESH start only: a resume passes no flags, and claude keeps the mcp config saved when the session first
  // started. A later change to this file does not reach a resumed session (a changed config needs a fresh start).
  mkdirSync(join(home, 'sessions'), { recursive: true })
  writeFileSync(mcpConfigPath(home, key), `${JSON.stringify(mcpConfig({ key, home, kit }), null, 2)}\n`, { mode: 0o600 })
  // The person's own settings file (deny rules, own CREW_HOME, remote control off), written before the start: the start
  // passes that one file as its --settings. The long-run profile's env is merged in, so the session keeps the owner's timeouts.
  // Applies to a FRESH start only: a resume keeps the settings saved when the session first started (deny rules, profile env),
  // so a later change to this file does not reach a resumed session.
  writeSettingsFile(home, key, { profileEnv: longRunEnv(kit) })
  // A record with an id is resumed, and only resumed: claude does not refuse an unknown id, it leaves a failed job, so the job
  // is checked (confirmResume) before the resume counts. A record written before the full id was kept holds the short id: the
  // full one comes from agents, else from the job record. A folder claude does not trust is reported with its own sentence.
  const resumeId = validSessionId(record?.id) ? fullIdOf(list, record.id, jobs) : ''
  if (resumeId) {
    const { cwd, args } = startArgs({ key, folder, home, kit, role, name, resume: resumeId })
    const run = runClaude(args, { bin, cwd })
    // Claude refuses a folder it does not trust with 'not trusted' on stderr: the reason names the folder and says what crew update does.
    if (!run.ok && /not trusted/i.test(run.stderr)) return { ok: false, reason: notTrustedReason(folder, readWorktreeBase(home)) }
    if (!run.ok) return { ok: false, reason: `resume refused: ${run.stderr || `exit ${run.status}`}` }
    const verdict = confirmResume({ bin, jobs, resumeId, name, confirmMs })
    if (!verdict.ok) return { ok: false, reason: `resume refused: ${verdict.detail}` }
    writeRecord(home, key, { id: resumeId, name: key, folder, startedAt: now(), recordedAt: new Date(now()).toISOString() })
    return { ok: true, id: resumeId, started: true, resumed: true }
  }
  const { cwd, args } = startArgs({ key, folder, home, kit, role, name })
  const run = runClaude(args, { bin, cwd })
  // Claude refuses a folder it does not trust with 'not trusted' on stderr: the reason names the folder and says what crew update does.
  if (!run.ok && /not trusted/i.test(run.stderr)) return { ok: false, reason: notTrustedReason(folder, readWorktreeBase(home)) }
  if (!run.ok) return { ok: false, reason: `claude did not start the session: ${run.stderr || `exit ${run.status}`}` }
  const after = listAgents({ bin }) ?? []
  // A fresh one is the newest session with this person's name: the name is used once, here, to learn the id; after that the id is
  // the only handle.
  const fresh = after.filter(a => a.name === name && a.state !== 'ended' && a.status !== 'stopped').sort((a, b) => b.startedAt - a.startedAt)[0]
  if (!fresh) return { ok: false, reason: `claude started, but no live session named ${name} shows in claude agents` }
  writeRecord(home, key, { id: fresh.id, name: key, folder, startedAt: fresh.startedAt || now(), recordedAt: new Date(now()).toISOString() })
  return { ok: true, id: fresh.id, started: true, resumed: false }
}

/**
 * How long a resume may take before the kit refuses it. Claude lists a resumed session at once, under the person's name. An unknown
 * id is listed as a working job named by its short id for about 20 s, then its job fails (checked 2026-11-19): the window is longer
 * than that, so the failure arrives first.
 */
export const RESUME_CONFIRM_MS = 45000

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** The folder of claude's job records: `jobs` when given, else CREW_JOBS_DIR, else ~/.claude/jobs (each job's folder is its short id). */
export function jobsDirOf(jobs) {
  return jobs || process.env.CREW_JOBS_DIR || join(homedir(), '.claude', 'jobs')
}

/** One job's state.json as an object, or null when there is none. */
export function readJob(jobs, short) {
  const path = join(jobsDirOf(jobs), short, 'state.json')
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Checks a resume after `claude --bg --resume <id>`. Claude does not refuse an unknown id: it leaves a job that fails after a while,
 * and lists it under its short id. So: a failed job is refused at once, with its detail; the session counts as resumed only when
 * agents lists this id live (not blocked) under the person's own session `name`. Otherwise the check waits up to `confirmMs`, then refuses.
 */
export function confirmResume({ bin, jobs, resumeId, name, confirmMs = RESUME_CONFIRM_MS, sleep = sleepMs, now = Date.now }) {
  const deadline = now() + confirmMs
  for (;;) {
    const job = readJob(jobs, resumeId.slice(0, 8))
    if (job?.state === 'failed') return { ok: false, detail: job.detail || 'the job failed' }
    const hit = (listAgents({ bin }) ?? []).find(a => a.id === resumeId)
    if (hit && hit.name === name && !['blocked', 'ended'].includes(hit.state) && !['blocked', 'stopped'].includes(hit.status)) return { ok: true }
    if (now() >= deadline) return { ok: false, detail: `session ${resumeId} did not come back as ${name} within ${Math.round(confirmMs / 1000)} s` }
    sleep(250)
  }
}

/**
 * The full sessionId for a recorded id: the id itself when agents lists it, else the entry whose short id it is; a short id agents
 * does not list (a stopped session) takes the sessionId of its job record (`<short>*\/state.json`); else the id as given.
 */
export function fullIdOf(list, id, jobs) {
  const hit = Array.isArray(list) ? list.find(a => a.id === id || a.shortId === id) : null
  if (hit) return hit.id
  if (/^[0-9a-fA-F]{8}$/.test(id)) {
    const full = jobSessionIdOf(jobs, id)
    if (full) return full
  }
  return id
}

/** The sessionId of the job record whose folder starts with this short id, or '' when there is none. */
export function jobSessionIdOf(jobs, short) {
  const dir = jobsDirOf(jobs)
  if (!existsSync(dir)) return ''
  for (const folder of readdirSync(dir)) {
    if (!folder.startsWith(short)) continue
    const sessionId = readJob(jobs, folder)?.sessionId
    if (validSessionId(sessionId) && sessionId.startsWith(short)) return sessionId
  }
  return ''
}

export function sessionStatus({ home, key, bin }) {
  const record = readRecord(home, key)
  if (!record) return { key, recorded: false, live: false, line: `${key}: no recorded session` }
  const list = listAgents({ bin })
  if (list === null) return { key, recorded: true, live: null, id: record.id, line: `${key}: recorded ${record.id}, claude agents did not answer` }
  const live = Boolean(liveById(list, record.id))
  return { key, recorded: true, live, id: record.id, line: `${key}: recorded ${record.id}, ${live ? 'live' : 'not live'}` }
}

export function sessionList({ home, bin }) {
  const dir = join(home, 'sessions')
  if (!existsSync(dir)) return []
  // The session records are <key>.json; the mcp configs are <key>.mcp.json and are not records.
  const keys = readdirSync(dir).filter(f => f.endsWith('.json') && !f.endsWith('.mcp.json')).map(f => f.slice(0, -5))
  return keys.map(key => sessionStatus({ home, key, bin }))
}

export function stopSession({ home, key, bin }) {
  const record = readRecord(home, key)
  if (!record) return { ok: false, reason: `${key}: no recorded session to stop` }
  // `claude stop` takes the short id that `claude agents` shows (the first 8 characters of the session id), not the full one:
  // the full id gets "No session matching" (checked 2026-11-19 on a scratch session). Resume still takes the full id.
  const short = validSessionId(record.id) ? record.id.slice(0, 8) : record.id
  const run = runClaude(['stop', short], { bin })
  return run.ok ? { ok: true, id: record.id } : { ok: false, reason: `claude stop ${record.id} failed: ${run.stderr || `exit ${run.status}`}` }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const home = crewHome()
  const kit = dirname(fileURLToPath(import.meta.url))
  const [command, key, folder] = process.argv.slice(2)
  const bin = process.env.CREW_CLAUDE_BIN || 'claude'
  let out
  if (command === 'start') {
    // The role is resolved here, only for a start: status and list never write a role file (role-file.mjs has the order).
    const promptsPath = join(home, 'PROMPTS.md')
    const crewPath = join(home, 'CREW.md')
    const resolved = resolveStartRole({
      home,
      key,
      promptsText: existsSync(promptsPath) ? readFileSync(promptsPath, 'utf8') : '',
      crewText: existsSync(crewPath) ? readFileSync(crewPath, 'utf8') : ''
    })
    if (!resolved.role) out = { ok: false, reason: resolved.reason || `no role for ${key}` }
    else {
      if (resolved.write) writeRoleFile(home, key, resolved.role)
      out = startSession({ home, kit, key, folder: folder ?? process.cwd(), role: resolved.role, bin, jobs: process.env.CREW_JOBS_DIR })
    }
    // A resume says so, and a refused one is the reason alone (exit 1): nothing is started fresh.
    const word = out.ok ? (out.resumed ? 'resumed' : out.started ? 'started' : out.note) : ''
    console.log(out.ok ? `${key}: session ${out.id} ${word}` : out.reason)
    process.exit(out.ok ? 0 : 1)
  }
  if (command === 'status') {
    const s = sessionStatus({ home, key, bin })
    console.log(s.line)
    process.exit(s.live ? 0 : 1)
  }
  if (command === 'list') {
    for (const s of sessionList({ home, bin })) console.log(s.line)
    process.exit(0)
  }
  if (command === 'stop') {
    out = stopSession({ home, key, bin })
    console.log(out.ok ? `${key}: stopped ${out.id}` : out.reason)
    process.exit(out.ok ? 0 : 1)
  }
  console.error('usage: crew session start <key> [folder] | status <key> | list | stop <key>')
  process.exit(64)
}
