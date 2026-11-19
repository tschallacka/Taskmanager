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

/** The sessions `claude agents --json` lists, as { id, name, state, status, startedAt }. Anything else is dropped. */
export function parseAgents(json) {
  let list
  try {
    list = JSON.parse(json)
  } catch {
    return null
  }
  if (!Array.isArray(list)) return null
  return list
    .filter(a => a && validSessionId(a.id))
    .map(a => ({ id: a.id, name: a.name ?? '', state: a.state ?? '', status: a.status ?? '', startedAt: Number(a.startedAt) || 0 }))
}

/** The live entry for a recorded id, or null. Matched by id only; the name is never used to find a live session here. */
export function liveById(list, id) {
  if (!Array.isArray(list) || !validSessionId(id)) return null
  const hit = list.find(a => a.id === id)
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
 * Starts the person's session, unless the recorded one is live. A recorded session that is not live is resumed first (the same
 * id, the same transcript); when claude refuses the resume, a fresh start follows and the new id is recorded. Before the start,
 * the crew's own folders are trusted in Claude Code's config (`trust`, claude-trust.mjs); a folder the crew did not make is
 * refused with a sentence that says what crew update does.
 */
export function startSession({ home, kit, key, folder, role, bin, now = Date.now, trust = trustForStart, resumeOnly = false }) {
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
  mkdirSync(join(home, 'sessions'), { recursive: true })
  writeFileSync(mcpConfigPath(home, key), `${JSON.stringify(mcpConfig({ key, home, kit }), null, 2)}\n`, { mode: 0o600 })
  // The person's own settings file (deny rules, own CREW_HOME, remote control off), written before the start: the start
  // passes that one file as its --settings. The long-run profile's env is merged in, so the session keeps the owner's timeouts.
  writeSettingsFile(home, key, { profileEnv: longRunEnv(kit) })
  // The resume first (when there is a recorded id), then a fresh start if claude refuses it. A folder claude does not trust
  // is not retried: the same refusal would come back.
  const resumeId = validSessionId(record?.id) ? record.id : ''
  let run
  let resumed = false
  for (const resume of resumeId ? (resumeOnly ? [resumeId] : [resumeId, '']) : ['']) {
    const { cwd, args } = startArgs({ key, folder, home, kit, role, name, resume })
    run = runClaude(args, { bin, cwd })
    resumed = Boolean(resume) && run.ok
    if (run.ok || /not trusted/i.test(run.stderr)) break
  }
  if (!run.ok && resumeOnly) return { ok: false, reason: `resume of ${resumeId} failed: ${run.stderr || `exit ${run.status}`}; not started fresh` }
  // Claude refuses a folder it does not trust with 'not trusted' on stderr: the reason names the folder and says what crew update does.
  if (!run.ok && /not trusted/i.test(run.stderr)) return { ok: false, reason: notTrustedReason(folder, readWorktreeBase(home)) }
  if (!run.ok) return { ok: false, reason: `claude did not start the session: ${run.stderr || `exit ${run.status}`}` }
  const after = listAgents({ bin }) ?? []
  // A resumed session keeps its id. A fresh one is the newest session with this person's name: the name is used once, here,
  // to learn the id; after that the id is the only handle.
  const resumedLive = resumed ? liveById(after, resumeId) : null
  const fresh = resumedLive ?? after.filter(a => a.name === name && a.state !== 'ended' && a.status !== 'stopped').sort((a, b) => b.startedAt - a.startedAt)[0]
  if (!fresh) return { ok: false, reason: `claude started, but no live session named ${name} shows in claude agents` }
  writeRecord(home, key, { id: fresh.id, name: key, folder, startedAt: fresh.startedAt || now(), recordedAt: new Date(now()).toISOString() })
  return { ok: true, id: fresh.id, started: true, resumed: Boolean(resumedLive) }
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
  // `claude stop <id>` is a verified verb: Boss used it on real sessions on 2026-11-19 (card mwmzv2jt).
  const run = runClaude(['stop', record.id], { bin })
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
      out = startSession({ home, kit, key, folder: folder ?? process.cwd(), role: resolved.role, bin })
    }
    console.log(out.ok ? `${key}: session ${out.id} ${out.started ? 'started' : out.note}` : out.reason)
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
