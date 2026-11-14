// A session whose last transcript line is an API error is blocked, not stuck (Boss, 2026-11-13: Wren's session stopped with
// "Please run /login · API Error: 403 Attention Required! | Cloudflare"). The daemon reads that last line only and reports
// the state "blocked: api error" with the error text, and mails Boss once for each distinct error.
export const BLOCKED_STATE = 'blocked: api error'
export const ERROR_CUT = 80

// An API error line, anchored at the start of the line: the transcript records the error as the line itself (optionally
// behind the login request), or the account limit line. A normal reply that only quotes one of these phrases mid-sentence
// is not an error.
const API_ERROR = /^(?:Please run \/login · )?API Error: \d{3}\b|^Please run \/login · API Error|^You'?ve hit your \d+-hour limit/

/**
 * The health of one session from its last transcript line: { state, error } when the line is an API error, otherwise null.
 * Only the matched text is kept, and it is cut to 80 characters, so nothing else from the transcript is stored or printed.
 */
export function blockedReason(lastLine) {
  const text = String(lastLine ?? '').replace(/\s+/g, ' ').trim()
  if (!API_ERROR.test(text)) return null
  return { state: BLOCKED_STATE, error: text.slice(0, ERROR_CUT) }
}

/**
 * Whether Boss gets a mail for this error: once for each distinct error text per session. `seen` is the list of error
 * texts already mailed for that session (kept in its record). Returns { mail, seen } where `seen` is the next list.
 */
export function errorMailOnce(health, seen = []) {
  if (!health) return { mail: false, seen }
  if (seen.includes(health.error)) return { mail: false, seen }
  return { mail: true, seen: [...seen, health.error] }
}

export function errorMailText({ key, cardId, error }) {
  return `session ${key} is blocked by an API error on card ${cardId ?? '(none)'}: ${error}. It is not stuck; it needs a fix (login or limit), and the daemon will not restart it.`
}
