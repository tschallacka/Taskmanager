// Susy's own detection (card mwnzgxz5uschuba1y7, owner ruling 2026-11-19): the daemon finds the stalled people itself and
// mails Boss one short line per distinct problem, with the cause, so Boss does not find them by hand. Six detections:
//   blocked  a session whose job is blocked by an API error (the restart is the fix);
//   startup  a session stuck on a startup dialog, or idle and never past its first prompt, for 5 minutes or more;
//   hung     a command that has run 15 minutes or more in a session's current turn (the job detail's "Running N shell
//            commands . Xm", with the command from the transcript);
//   gate     a card in a review gate with ready work for 15 minutes or more, and nobody on it (the owner has no session,
//            or is idle for 15 minutes or more);
//   gone     a person with an In progress card whose recorded session is no longer live;
//   wake     a wake that failed three times in a row, with the real error the wake recorded.
// The functions here are pure: they take the evidence (`claude agents --json`, the job states, the board's cards, the
// session records, a command reader) and return the problems. The daemon reads the evidence and sends the mail.
import { existsSync, openSync, readFileSync, readSync, closeSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { GATES } from './susy.mjs'

export const MIN = 60000
export const STARTUP_MINUTES = 5
export const HUNG_MINUTES = 15
export const GATE_MINUTES = 15
export const REPEAT_MINUTES = 30
export const WAKE_FAILURES = 3

const CUT = 160
const API_ERROR = /^API Error\b/
const STARTUP = /resume picker|startup dialog|send a prompt to start/i
const HUNG = /Running (\d+) shell commands?\s*\.\s*(\d+)\s*m\b/
const TITLE = {
  blocked: 'session blocked by an API error',
  startup: 'session never got past its start',
  hung: 'command hung',
  gate: 'gate has had no update and nobody on it',
  gone: 'person has a card and no live session',
  wake: 'wake failed three times'
}

/** A job's state (`~/.claude/jobs/<id>/state.json`: state, detail, tempo, tokens, updatedAt, linkScanPath), or null. */
export function readJob(jobsRoot, id) {
  if (!id) return null
  try {
    return JSON.parse(readFileSync(join(jobsRoot, id, 'state.json'), 'utf8'))
  } catch {
    return null
  }
}

/** The session records the crew keeps (`sessions/<key>.json`): key, id, and the wake's failure state when there is one. */
export function readRecords(home) {
  const dir = join(home, 'sessions')
  if (!existsSync(dir)) return []
  const out = []
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json') && !f.endsWith('.mcp.json'))) {
    try {
      const record = JSON.parse(readFileSync(join(dir, file), 'utf8'))
      out.push({ key: file.slice(0, -5), id: record.id ?? null, wake: record.wake ?? null })
    } catch {
      // An unreadable record is no evidence.
    }
  }
  return out
}

/**
 * The command of a session's newest Bash call, read from the end of its transcript (the last tail bytes only), cut to 160
 * characters. Null when the file cannot be read or holds no Bash call.
 */
export function lastBashCommand(file, bytes = 262144) {
  if (!file) return null
  let text
  try {
    const size = statSync(file).size
    const start = Math.max(0, size - bytes)
    const fd = openSync(file, 'r')
    try {
      const buf = Buffer.alloc(size - start)
      readSync(fd, buf, 0, buf.length, start)
      text = buf.toString('utf8')
    } finally {
      closeSync(fd)
    }
  } catch {
    return null
  }
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry
    try {
      entry = JSON.parse(lines[i])
    } catch {
      continue
    }
    const content = entry?.message?.content
    if (!Array.isArray(content)) continue
    const use = content.filter(b => b?.type === 'tool_use' && b.name === 'Bash').pop()
    if (use) return String(use.input?.command ?? '').replace(/\s+/g, ' ').trim().slice(0, CUT)
  }
  return null
}

const minutesSince = (at, now) => {
  const t = Date.parse(at)
  return Number.isFinite(t) ? Math.floor((now - t) / MIN) : null
}

/**
 * The session of an owner key. The name is the key, or starts with it or ends with it (`pia-session-82`, `taskmanager-maintenance-nina`).
 */
function sessionOf(key, sessions) {
  return sessions.find((s) => {
    const name = String(s.name ?? '')
    return name === key || name.startsWith(`${key}-`) || name.endsWith(`-${key}`)
  }) ?? null
}

/** The newest post on a card (its update times), or its own updatedAt when it has no post. Ms, or null. */
function lastPostAt(card) {
  const times = (card.updates ?? []).map(u => Date.parse(u.at)).filter(Number.isFinite)
  if (times.length) return Math.max(...times)
  const own = Date.parse(card.updatedAt)
  return Number.isFinite(own) ? own : null
}

/** The one line Boss gets for a problem: what, who, card, since when, the evidence, and the one next step. */
export function problemText(p) {
  const card = p.cardId ? ` on card ${p.cardId}` : ''
  const since = p.since ? ` since ${p.since}` : ''
  const age = p.age !== null && p.age !== undefined ? ` (${p.age} min)` : ''
  return `susy: ${TITLE[p.kind]}: ${p.who}${card}${since}${age}. Evidence: ${p.evidence}. Next: ${p.next}.`
}

function problem(fields) {
  const p = { cardId: null, since: null, age: null, ...fields }
  return { ...p, text: problemText(p) }
}

/**
 * The problems now. `sessions` is the `claude agents --json` list, or null when it cannot be read (then nothing needs it).
 * `jobs` maps a session id to its job state. `cards` are the board's cards, `records` the session records, `keyOf` maps a
 * display name to a key, `commandOf(job)` gives the running command of a job (or null).
 */
export function detectProblems({ now, sessions = null, jobs = new Map(), cards = [], records = [], keyOf = () => null, commandOf = () => null }) {
  const out = []
  const inProgress = key => cards.find(c => c.column === 'In progress' && keyOf(c.assignee) === key) ?? null

  if (sessions) {
    for (const s of sessions) {
      const job = jobs.get(s.id ?? s.sessionId) ?? null
      if (!job) continue
      const who = s.name ?? s.sessionId
      const detail = String(job.detail ?? '')
      const age = minutesSince(job.updatedAt, now)
      if (job.tempo === 'blocked' || API_ERROR.test(detail)) {
        out.push(problem({
          key: `blocked|${who}|${detail.slice(0, CUT)}`, kind: 'blocked', who, since: job.updatedAt ?? null, age,
          evidence: /API Error/.test(detail) ? detail.slice(0, CUT) : `API error: ${detail.slice(0, CUT)}`,
          next: `restart ${who} (the error stops the session; a restart is the fix)`
        }))
        continue
      }
      const idleNoTurn = job.tempo === 'idle' && (job.tokens ?? null) === 0
      if ((STARTUP.test(detail) || idleNoTurn) && age !== null && age >= STARTUP_MINUTES) {
        out.push(problem({
          key: `startup|${who}|${detail.slice(0, CUT)}`, kind: 'startup', who, since: job.updatedAt ?? null, age,
          evidence: `${detail.slice(0, CUT) || 'idle with no turn taken'}`,
          next: `type the first instruction into ${who}, or answer its dialog, or restart it`
        }))
        continue
      }
      const hung = HUNG.exec(detail)
      if (hung && Number(hung[2]) >= HUNG_MINUTES) {
        const minutes = Number(hung[2])
        const command = commandOf(job) || '(not in the transcript)'
        out.push(problem({
          key: `hung|${who}|${command}`, kind: 'hung', who, since: new Date(now - minutes * MIN).toISOString(), age: minutes,
          evidence: `${detail.slice(0, CUT)}; command: ${command}`,
          next: `ask ${who} to stop the command (Ctrl-C in its session), or restart ${who}`
        }))
      }
    }
  }

  if (sessions) {
    for (const card of cards) {
      // The owner of a gate is GATES in susy.mjs (Verify PM is Pia, who sets the pm label from Pat's verdict).
      const owner = GATES[card.column]
      if (!owner) continue
      const posted = lastPostAt(card)
      const age = posted === null ? null : Math.floor((now - posted) / MIN)
      if (age === null || age < GATE_MINUTES) continue
      const session = sessionOf(owner, sessions)
      let reason = null
      if (!session) reason = `${owner} has no live session`
      else {
        const job = jobs.get(session.id ?? session.sessionId) ?? null
        const idleFor = job ? minutesSince(job.updatedAt, now) : null
        if (job && job.tempo === 'idle' && idleFor !== null && idleFor >= GATE_MINUTES) reason = `${owner} has been idle for ${idleFor} min`
      }
      if (!reason) continue
      out.push(problem({
        key: `gate|${card.id}|${card.column}`, kind: 'gate', who: owner, cardId: card.id, since: new Date(posted).toISOString(), age,
        evidence: `${card.column}: no update for ${age} min; ${reason}`,
        next: `wake ${owner} on card ${card.id}`
      }))
    }
  }

  if (sessions) {
    for (const record of records) {
      const card = inProgress(record.key)
      if (!card) continue
      const live = sessions.some(s => s.sessionId === record.id || s.id === record.id)
      if (live) continue
      out.push(problem({
        key: `gone|${record.key}|${card.id}`, kind: 'gone', who: record.key, cardId: card.id,
        evidence: `recorded session ${record.id ?? '(none)'} is not in claude agents; ${card.id} is In progress`,
        next: `restart ${record.key} on card ${card.id}`
      }))
    }
  }

  for (const record of records) {
    const failures = record.wake?.failures ?? 0
    if (failures < WAKE_FAILURES || !record.wake?.lastError) continue
    const card = inProgress(record.key)
    out.push(problem({
      key: `wake|${record.key}|${record.wake.lastError}`, kind: 'wake', who: record.key, cardId: card?.id ?? null,
      evidence: `${failures} failed wakes in a row; last error: ${String(record.wake.lastError).slice(0, 200)}`,
      next: `look at ${record.key}'s screen and clear the cause the error names; the wake sender stays quiet until one works`
    }))
  }
  return out
}

/** The problems that are due for a mail: never mailed, or last mailed REPEAT_MINUTES or more ago. `mailed` maps key to ms. */
export function dueMails({ problems, mailed = {}, now }) {
  return problems.filter(p => mailed[p.key] === undefined || now - mailed[p.key] >= REPEAT_MINUTES * MIN)
}

/** The mailed map kept to the problems that still hold: a problem that cleared is dropped, so a return is new again. */
export function pruneMailed(mailed = {}, problems) {
  const keep = {}
  for (const p of problems) if (mailed[p.key] !== undefined) keep[p.key] = mailed[p.key]
  return keep
}
