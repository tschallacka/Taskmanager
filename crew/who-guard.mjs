// The who guard (card mwghrx2k8dwf8h93say, optional part). A person's session is started with CREW_WHO set to its key
// (session-settings.mjs), so the session's crew commands can name that key only. A shell with no CREW_WHO (Boss's) is not
// guarded. Pure: the caller passes argv and env.
const KEY = /^[a-z][a-z0-9-]{0,31}$/

// Words that are crew commands, not a person's key: a top-level command is never read as a key (crew update --check).
const TOP = new Set([
  'people', 'listen', 'watch', 'init', 'setup', 'channel', 'update', 'mentions', 'totp', 'devadmin', 'claude', 'janet',
  'publish', 'activity', 'watch-crew', 'up', 'restart-brief', 'dev-copies', 'down', 'susy-daemon', 'session',
  'browser', 'prepare', 'serve', 'lab', 'susy', 'boss-mentions', '-h', '--help'
])

/**
 * The person key a command runs as, or null when no key is named. `crew <key> <command>` names it first; `crew listen <key>`
 * and `crew channel <key>` name it second.
 */
export function guardedKey(first, rest = []) {
  if (first === 'listen' || first === 'channel') {
    const second = rest[0]
    return second && KEY.test(second) && !TOP.has(second) ? second : null
  }
  if (!first || TOP.has(first) || !KEY.test(first)) return null
  return first
}

/** `{ ok: true }` when the command may run here; `{ ok: false, reason }` when this session is bound to another key. */
export function whoGuard(key, env = process.env) {
  const bound = env.CREW_WHO
  if (!bound || key === bound) return { ok: true }
  return { ok: false, reason: `this session is ${bound}; it may not run crew ${key}. Run only crew ${bound}.` }
}
