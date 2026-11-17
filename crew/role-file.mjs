// The role a person's session starts with (card mwgxj8mht4sfs2mejj). One module for the role file, so `crew up` and
// `crew session start` cannot disagree:
//   - a worker (wren, wick, wynn, wade) has a worker section in PROMPTS.md. Its role is rebuilt from PROMPTS.md on every start
//     (the section, then the CREW.md standing rules), and written to CREW_HOME/sessions/<key>.role.md (mode 600). A prompt
//     change therefore reaches the worker on the next start.
//   - any other key (nina, pat, quincy, ...) has no worker section here. Its role is its own file, CREW_HOME/sessions/<key>.role.md,
//     read as it is. A key with neither is not started.
//   - CREW_ROLE_FILE, when it is set, overrides both (a path to a file, read as it is).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const KEY_RE = /^[a-z][a-z0-9-]{0,31}$/

export const WORKER_NICKS = { wren: 'Wren Worker', wick: 'Wick Worker', wynn: 'Wynn Worker', wade: 'Wade Worker' }

/** True for a person key that may name a file: lower case letters, digits and dashes, starting with a letter. */
export function validKey(key) {
  return KEY_RE.test(String(key ?? ''))
}

/** The one path of a person's role file, CREW_HOME/sessions/<key>.role.md. Throws for a key that is not a plain name. */
export function roleFilePath(home, key) {
  if (!validKey(key)) throw new Error(`no such person key: ${key}`)
  return join(home, 'sessions', `${key}.role.md`)
}

/** The worker role for one key, from the PROMPTS.md text: the fenced block under "## Worker", with W and NICK filled in. */
export function workerRole(promptsText, key) {
  const nick = WORKER_NICKS[key]
  if (!nick) return null
  const lines = String(promptsText ?? '').split('\n')
  const head = lines.findIndex(line => line.startsWith('## Worker (key'))
  if (head < 0) return null
  const open = lines.findIndex((line, i) => i > head && line.startsWith('```'))
  if (open < 0) return null
  const close = lines.findIndex((line, i) => i > open && line.startsWith('```'))
  if (close < 0) return null
  return lines.slice(open + 1, close).join('\n')
    .replace(/\bW\b/g, key)
    .replace(/\bNICK\b/g, nick)
    .concat('\n')
}

/**
 * The role text of a worker's session: the PROMPTS.md worker section, then the CREW.md standing rules (the whole file),
 * in that order. Pure. A missing CREW.md gives the section alone.
 */
export function roleFileText(promptsText, crewText, key) {
  const section = workerRole(promptsText, key) ?? ''
  const rules = String(crewText ?? '').trimEnd()
  return rules ? `${section.trimEnd()}\n\n${rules}\n` : `${section.trimEnd()}\n`
}

/** The text of a person's own role file, or null when there is none (or the key is not a plain name). */
export function readOwnRoleFile(home, key) {
  if (!validKey(key)) return null
  const path = roleFilePath(home, key)
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

/** Writes one person's role file, mode 600. Returns its path. */
export function writeRoleFile(home, key, text) {
  const path = roleFilePath(home, key)
  mkdirSync(join(home, 'sessions'), { recursive: true })
  writeFileSync(path, text, { mode: 0o600 })
  return path
}

/**
 * The first line of every person's role: who the session is, and what it may run. A session that reads only this and its
 * role file knows its key (card mwghrx2k8dwf8h93say); the user instructions no longer reach it (session.mjs, sources).
 */
export function identityLine(key) {
  return `Your key is ${key}. Run only crew ${key} (for example crew ${key} mcp, crew ${key} update). Never run crew boss or crew pm. Every post is under your own name.`
}

/** The role with the identity line first, once. Pure. */
export function withIdentity(key, role) {
  return `${identityLine(key)}\n\n${String(role ?? '').replace(/^\s*\n/, '')}`
}

/**
 * The role for `crew session start <key>` (and for `crew up`, through upSessions). Pure: it reads and returns, and writes
 * nothing. Returns { role, source, write } or { role: '', reason }. `write` is true only for a worker's rebuilt section: the
 * caller writes it with writeRoleFile before the start, so the file is written where the start is, not inside this call.
 * Order: CREW_ROLE_FILE (the override); a worker's section, rebuilt; the key's own role file; nothing.
 */
export function resolveStartRole({ home, key, promptsText, crewText, env = process.env }) {
  if (!validKey(key)) return { role: '', reason: `no such person key: ${key}` }
  if (env.CREW_ROLE_FILE) {
    return existsSync(env.CREW_ROLE_FILE)
      ? { role: withIdentity(key, readFileSync(env.CREW_ROLE_FILE, 'utf8')), source: 'CREW_ROLE_FILE', write: false }
      : { role: '', reason: `CREW_ROLE_FILE does not exist: ${env.CREW_ROLE_FILE}` }
  }
  if (workerRole(promptsText, key)) {
    return { role: withIdentity(key, roleFileText(promptsText, crewText, key)), source: 'PROMPTS.md', write: true }
  }
  const own = readOwnRoleFile(home, key)
  if (own !== null) return { role: withIdentity(key, own), source: 'sessions role file', write: false }
  return { role: '', reason: `no role for ${key}: no worker section in PROMPTS.md and no sessions/${key}.role.md` }
}
