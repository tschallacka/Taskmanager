// The board call a crew listener makes, with a retry when the board is out (card mwifm8qa5n044bzymkl). A deploy answers
// HTML, a 5xx or nothing at all for a while; the listener used to end on the first of those, and its Stop hook then
// gave up. Now an outage is waited out: 60 s, doubling, capped at 5 min, forever, reported once on stderr. A 4xx is a
// fault and is thrown at once. The status file the platform may publish (STATUS_PATH) only adds a reason and a
// retry_after; it is never trusted beyond waiting, and its absence means plain backoff.

export const STATUS_PATH = '/.well-known/blaze-status.json'
const FIRST_WAIT_MS = 60_000
const CAP_MS = 300_000

/** The plain wait after the `attempt`-th failure (0 first): 60 s, 120 s, 240 s, then 5 min. */
export function backoffMs(attempt) {
  return Math.min(FIRST_WAIT_MS * 2 ** attempt, CAP_MS)
}

/**
 * The wait and the reason from a status answer. `status` is the parsed file, or null when there is none. A
 * retry_after is used when it is a positive number, capped at 5 min; anything else is plain backoff.
 */
export function statusWait(status, attempt) {
  const fallback = backoffMs(attempt)
  if (!status || typeof status !== 'object' || typeof status.state !== 'string') return { waitMs: fallback, reason: null }
  const reason = [status.state, status.reason].filter(Boolean).join(': ')
  const seconds = Number(status.retry_after)
  if (!Number.isFinite(seconds) || seconds <= 0) return { waitMs: fallback, reason }
  return { waitMs: Math.min(seconds * 1000, CAP_MS), reason }
}

// The status file, read after a failure. Any answer that is not a JSON object (404, HTML, a dead server) is "no file".
async function readStatus(url, fetchImpl) {
  try {
    const res = await fetchImpl(`${new URL(url).origin}${STATUS_PATH}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5_000) })
    if (!res.ok) return null
    const parsed = JSON.parse(await res.text())
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Makes the request and returns the parsed JSON answer. Retries an outage forever with backoff; throws a 4xx at once.
 * `deps` are for tests: the fetch, the sleep and the stderr line.
 */
export async function boardRequest(req, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch
  const sleep = deps.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const log = deps.log ?? (line => process.stderr.write(`${line}\n`))
  // A socket that connects and never answers is an outage after this long (30 s: a list call answers in seconds, and a
  // slow deploy gets room before the listener starts waiting).
  const timeoutMs = deps.timeoutMs ?? 30_000
  let attempt = 0
  let reported = false
  for (;;) {
    let outage
    let res
    try {
      res = await fetchImpl(req.url, { ...req.init, signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      outage = `connection error: ${error?.message ?? error}`
    }
    if (res) {
      if (res.status >= 400 && res.status < 500) throw new Error(`board answered ${res.status} for ${req.url}`)
      const text = await res.text().catch(() => '')
      if (res.status < 500) {
        try {
          return JSON.parse(text)
        } catch {
          outage = `answered HTML or not JSON (status ${res.status})`
        }
      } else {
        outage = `answered ${res.status}`
      }
    }
    const { waitMs, reason } = statusWait(await readStatus(req.url, fetchImpl), attempt)
    if (!reported) {
      log(`board unreachable (${outage}); retrying by itself${reason ? `: ${reason}` : ''}`)
      reported = true
    }
    await sleep(waitMs)
    attempt++
  }
}

/**
 * The listener's board call. An outage is waited out (boardRequest). A 4xx is a key or a request the board refuses: the
 * listener logs it once and gets null, as it did before the retry helper, so a bad key does not end the listener.
 */
export async function listenerCall(req, deps = {}) {
  const log = deps.log ?? (line => process.stderr.write(`${line}\n`))
  try {
    return await boardRequest(req, deps)
  } catch (error) {
    log(`board call refused, the listener goes on: ${error?.message ?? error}`)
    return null
  }
}
