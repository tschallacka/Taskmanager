// The daemon's API-error check for the person sessions (card mwdblb506deyxnet5i7, Boss go 2026-11-13). Each tick it reads
// the last transcript line of every recorded session (sessions/<key>.json), and only that line. A line that is an API
// error (403, login, the account limit) makes the session "blocked: api error" with the error text (cut to 80 characters),
// and Boss gets one mail per distinct error text. A later normal line clears the state, so a later error mails again.
import { existsSync, readdirSync, readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { blockedReason, errorMailOnce, errorMailText } from './session-health.mjs'

const TAIL_BYTES = 8192

/** The last non-empty line of a file, read from its tail only. Null when the file cannot be read. */
export function lastLineOf(file) {
  try {
    const size = statSync(file).size
    const start = Math.max(0, size - TAIL_BYTES)
    const fd = openSync(file, 'r')
    try {
      const buf = Buffer.alloc(size - start)
      readSync(fd, buf, 0, buf.length, start)
      const lines = buf.toString('utf8').split('\n').filter(l => l.trim())
      return lines.length ? lines[lines.length - 1] : null
    } finally {
      closeSync(fd)
    }
  } catch {
    return null
  }
}

/**
 * The text of one transcript line: the message content (a string, or the text blocks of a list), for a JSON line. A line
 * that is not JSON is taken as it is. Only this text is checked and kept, never the rest of the line.
 */
export function textOf(line) {
  if (!line) return null
  try {
    const o = JSON.parse(line)
    const content = o?.message?.content ?? o?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) return content.map(b => (typeof b?.text === 'string' ? b.text : '')).join(' ')
    return null
  } catch {
    return line
  }
}

/**
 * The transcript of a session: the file whose name starts with the recorded short id, found one folder down under the
 * projects root (the way Claude Code lays its transcripts out). Null when none is found.
 */
export function transcriptOf(root, id) {
  if (!id || !existsSync(root)) return null
  for (const folder of readdirSync(root)) {
    const dir = join(root, folder)
    let names = []
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    const hit = names.find(n => n.startsWith(id) && n.endsWith('.jsonl'))
    if (hit) return join(dir, hit)
  }
  return null
}

/**
 * One tick of the API-error check over every recorded session. `state` is the daemon state (its sessionErrors map keeps
 * the mailed error texts per person). Returns the log lines, the mail texts to send to Boss (only for the new errors), and
 * the next sessionErrors map.
 */
export function sessionErrorReport({ home, root, state = {}, live = false }) {
  const dir = join(home, 'sessions')
  const next = {}
  const lines = []
  const pending = []
  if (!existsSync(dir)) return { lines, pending, sessionErrors: next }
  const keys = readdirSync(dir).filter(f => f.endsWith('.json') && !f.endsWith('.mcp.json')).map(f => f.slice(0, -5))
  for (const key of keys) {
    let record
    try {
      record = JSON.parse(readFileSync(join(dir, `${key}.json`), 'utf8'))
    } catch {
      continue
    }
    const file = transcriptOf(root, record.id)
    const last = file ? lastLineOf(file) : null
    const health = blockedReason(textOf(last))
    const prior = state.sessionErrors?.[key] ?? { seen: [] }
    if (!health) {
      // A normal line clears the blocked state, and the mailed list with it. A dry run only reports, so it changes nothing.
      if (prior.seen?.length) lines.push(`${key}: no api error on the last line; the block is cleared${live ? '' : ' (dry run: not applied)'}`)
      next[key] = live ? { seen: [] } : prior
      continue
    }
    const { mail } = errorMailOnce(health, prior.seen ?? [])
    // The error is marked seen only by markMailed, after a live send succeeds: a dry run never marks it.
    next[key] = prior
    lines.push(`${key}: ${health.state}: ${health.error}`)
    if (mail) {
      lines.push(live ? `mail boss once: ${key} is blocked by an API error` : `would mail boss once: ${key} is blocked by an API error (dry run)`)
      pending.push({ key, error: health.error, text: errorMailText({ key, cardId: record.cardId ?? null, error: health.error }) })
    }
  }
  return { lines, pending, sessionErrors: next }
}

/** The sessionErrors map with the error marked as mailed for that person. Called only after a live send succeeded. */
export function markMailed(sessionErrors, key, error) {
  const prior = sessionErrors?.[key] ?? { seen: [] }
  return { ...sessionErrors, [key]: { seen: [...(prior.seen ?? []), error] } }
}
