// The recorded person sessions for `crew up` and `crew down` (card mwdblb506deyxnet5i7). `crew up` starts each person whose
// recorded session (CREW_HOME/sessions/<key>.json) is not running, with the strict start, and sends one wake through the
// wake sender. `crew down` stops each recorded session that is running, by its recorded id. One line per person.
//
// The role a started worker gets is one file, CREW_HOME/sessions/<key>.role.md (mode 600): the worker section of PROMPTS.md
// (the fenced block under "## Worker", with the placeholders W and NICK filled in) followed by the standing rules of
// CREW.md. The start reads that role file. Only the four workers have a role here; any other key is reported as failed,
// not started with a guessed role.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { liveById, listAgents, readRecord, startSession, stopSession, validSessionId, writeRecord } from './session.mjs'
import { wakeOnce } from './wake.mjs'
import { roleFileText, workerRole, writeRoleFile, readOwnRoleFile, resolveStartRole, WORKER_NICKS } from './role-file.mjs'

export { WORKER_NICKS, workerRole, roleFileText, writeRoleFile, readOwnRoleFile }

/** The keys of the recorded sessions in CREW_HOME/sessions (the mcp configs are not records). */
export function recordedKeys(home) {
  const dir = join(home, 'sessions')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.json') && !f.endsWith('.mcp.json'))
    .map(f => f.slice(0, -5))
    .sort()
}

// The wake text typed into a restarted session, once. It is the text, not the role file: the role is read by the start, and
// the wake only says that the session is back. The person reads their own card; the kit does not name one.
export const RESTART_WAKE = 'Crew up: your session was started again. Read your card with my_tasks, carry on with it, and post your next update on the card.'

/**
 * `crew up` for the recorded sessions. `deps` are injected for the tests: `listAgents()` (the live list, or null),
 * `start({ key, folder, role })` (the startSession result), `wake({ key, id, text })` (the wake result, ok or not), and
 * `promptsText` (the PROMPTS.md text). Returns the lines and whether every session is running.
 */
export async function upSessions(home, deps) {
  const lines = []
  let allUp = true
  const list = deps.listAgents()
  for (const key of recordedKeys(home)) {
    const record = readRecord(home, key)
    if (!record || !validSessionId(record.id)) {
      allUp = false
      lines.push(`${key}: failed: the recorded session id is not a session id; start it by hand`)
      continue
    }
    if (list && liveById(list, record.id)) {
      lines.push(`${key}: already running (${record.id})`)
      continue
    }
    // The same role rule as `crew session start` (resolveStartRole): CREW_ROLE_FILE, then a worker's rebuilt section, then the
    // key's own role file. A key with none of them is reported as failed and not started.
    const resolved = resolveStartRole({ home, key, promptsText: deps.promptsText, crewText: deps.crewText, env: deps.env })
    if (resolved.reason) {
      allUp = false
      lines.push(`${key}: failed: ${resolved.reason}; not started`)
      continue
    }
    // A worker's rebuilt role is written before the start, so the start is given exactly what the file holds.
    if (resolved.write) writeRoleFile(home, key, resolved.role)
    const started = deps.start({ key, folder: record.folder, role: resolved.role })
    if (!started.ok) {
      allUp = false
      lines.push(`${key}: failed: ${started.reason}`)
      continue
    }
    const woke = await deps.wake({ key, id: started.id, text: RESTART_WAKE })
    if (woke.ok) lines.push(`${key}: started (${started.id}), woke once`)
    else {
      allUp = false
      lines.push(`${key}: started (${started.id}), wake not sent: ${woke.reason}`)
    }
  }
  return { lines, ok: allUp }
}

/** `crew down` for the recorded sessions: each running one is stopped by its recorded id. */
export function downSessions(home, deps) {
  const lines = []
  let allDown = true
  const list = deps.listAgents()
  for (const key of recordedKeys(home)) {
    const record = readRecord(home, key)
    if (!record || !validSessionId(record.id)) {
      allDown = false
      lines.push(`${key}: failed: the recorded session id is not a session id; stop it by hand`)
      continue
    }
    if (!list || !liveById(list, record.id)) {
      lines.push(`${key}: not running`)
      continue
    }
    const stopped = deps.stop({ key })
    if (stopped.ok) lines.push(`${key}: stopped (${record.id})`)
    else {
      allDown = false
      lines.push(`${key}: failed to stop ${record.id}: ${stopped.reason}`)
    }
  }
  return { lines, ok: allDown }
}

/**
 * The one wake of a restarted session, through the same wake sender as `wake.mjs`: it waits for the session to be idle,
 * types by recorded id through session-wake.sh, and keeps the failure count in the record.
 */
export function realWake(home, kit, bin) {
  return async ({ key, text }) => {
    const record = readRecord(home, key)
    const out = await wakeOnce({
      record,
      list: listAgents({ bin }),
      text,
      cardId: null,
      key,
      type: ({ id, text: body }) => {
        const run = spawnSync('sh', [join(kit, 'session-wake.sh'), id, body], { encoding: 'utf8', timeout: 120000 })
        if (run.status !== 0) throw new Error(String(run.stderr || `exit ${run.status}`).trim().split('\n').pop())
      },
      readList: () => listAgents({ bin })
    })
    if (record) writeRecord(home, key, { ...record, wake: out.wake })
    return { ok: out.ok, reason: out.reason }
  }
}

/** The real dependencies for a crew home: claude from CREW_CLAUDE_BIN or PATH, the kit folder, the PROMPTS.md text. */
export function realSessionDeps(home, kit, { bin = process.env.CREW_CLAUDE_BIN || 'claude' } = {}) {
  const promptsPath = join(home, 'PROMPTS.md')
  const crewPath = join(home, 'CREW.md')
  return {
    promptsText: existsSync(promptsPath) ? readFileSync(promptsPath, 'utf8') : '',
    crewText: existsSync(crewPath) ? readFileSync(crewPath, 'utf8') : '',
    listAgents: () => listAgents({ bin }),
    start: ({ key, folder, role }) => startSession({ home, kit, key, folder, role, bin }),
    stop: ({ key }) => stopSession({ home, key, bin }),
    wake: realWake(home, kit, bin)
  }
}
