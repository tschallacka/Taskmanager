// The wake sender for a person's session (card mwdblb506deyxnet5i7). It types a mail into the person's recorded session
// by id only, after waiting for the session to be idle, and it follows Boss's three rulings:
//   1. never type into a working pane: wait for idle; give up after 5 minutes and retry on the next tick;
//   2. a logged wake text is cut to 80 characters, so names in mail are never logged in full;
//   3. three failed wakes in a row for one person mail Boss once (name, card, last error), then stay quiet until a wake works.
// The planner (planWake in session.mjs) decides the recorded id. The typing itself is injected (`type`), so the tests
// run with a fake; the real typer is crew/session-wake.sh, used only on Boss's go.
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { crewHome } from './home.mjs'
import { liveById, listAgents, readRecord, writeRecord } from './session.mjs'

export const IDLE_WAIT_MS = 5 * 60_000
export const POLL_MS = 15_000
export const LOG_CUT = 80
export const FAILURES_TO_MAIL_BOSS = 3

/** The logged form of a wake text: cut to 80 characters, one line, never more. */
export function logCut(text) {
  return String(text ?? '').replace(/\s+/g, ' ').slice(0, LOG_CUT)
}

/** The state of a session entry for the wait: 'idle' only when claude agents says idle; anything else is 'busy'. */
export function sessionReady(entry) {
  if (!entry) return 'gone'
  return entry.status === 'idle' || entry.state === 'idle' ? 'idle' : 'busy'
}

/**
 * Waits until the recorded session is idle, polling `readList()` (the claude agents list). Returns 'idle' when idle,
 * 'gone' when the recorded id is not live, 'unknown' when the list cannot be read, or 'timeout' after the wait.
 * Never pastes: the caller pastes only on 'idle'.
 */
export async function waitForIdle({ id, readList, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)), timeoutMs = IDLE_WAIT_MS, pollMs = POLL_MS }) {
  const deadline = now() + timeoutMs
  for (;;) {
    const list = readList()
    if (list === null) {
      if (now() >= deadline) return 'unknown'
    } else {
      const entry = liveById(list, id)
      if (!entry) return 'gone'
      if (sessionReady(entry) === 'idle') return 'idle'
    }
    if (now() >= deadline) return 'timeout'
    await sleep(Math.min(pollMs, Math.max(0, deadline - now())))
  }
}

/** Failure counter for one person, kept in the session record as wake: { failures, mailedBoss }. Pure: returns the next state. */
export function recordWake(wake = {}, ok, error = '') {
  if (ok) return { failures: 0, mailedBoss: false, lastError: null }
  const failures = (wake.failures ?? 0) + 1
  return { failures, mailedBoss: wake.mailedBoss ?? false, lastError: String(error).slice(0, 200), mailBossNow: failures >= FAILURES_TO_MAIL_BOSS && !(wake.mailedBoss ?? false) }
}

/** The mail to Boss after three failures: name, card and last error, once per streak. */
export function bossMailText({ key, cardId, lastError }) {
  return `wake failed three times in a row for ${key} on card ${cardId}; last error: ${logCut(lastError)}. The sender stays quiet until a wake works.`
}

/**
 * One tick for one person: plan by recorded id, wait for idle, type through `type({id, text})`, and update the failure
 * counter. `record` is the person's session record (with an optional wake state). Returns { ok, reason, wake, mailBoss }.
 */
export async function wakeOnce({ record, list, text, cardId, key, type, readList, now, sleep, timeoutMs, pollMs }) {
  if (!record?.id) return finish(false, 'no recorded session', record, { key, cardId })
  if (list === null) return finish(false, 'claude agents did not answer; retry next tick', record, { key, cardId }, false)
  const entry = liveById(list, record.id)
  if (!entry) return finish(false, `recorded session ${record.id} is not live`, record, { key, cardId })
  const waited = await waitForIdle({ id: record.id, readList, now, sleep, timeoutMs, pollMs })
  // 'unknown' (claude agents did not answer) is not counted as a failed wake: the sender only retries next tick.
  if (waited !== 'idle') return finish(false, `session ${record.id} was ${waited}, not idle; retry next tick`, record, { key, cardId }, waited !== 'unknown')
  try {
    await type({ id: record.id, text })
    return finish(true, `woke ${record.id} with "${logCut(text)}"`, record, { key, cardId })
  } catch (error) {
    return finish(false, `paste failed: ${error.message}`, record, { key, cardId })
  }
}

function finish(ok, reason, record, { key, cardId }, counts = true) {
  const prior = record?.wake ?? {}
  const wake = counts ? recordWake(prior, ok, ok ? '' : reason) : prior
  const mailBoss = Boolean(wake.mailBossNow)
  const out = { ok, reason: logCut(reason), wake: { failures: wake.failures ?? 0, mailedBoss: wake.mailedBoss ?? false, lastError: wake.lastError ?? null } }
  if (mailBoss) {
    out.mailBoss = bossMailText({ key, cardId, lastError: wake.lastError })
    out.wake.mailedBoss = true
  }
  return out
}

// `node crew/wake.mjs <key> <card id> <text>`: one wake for one person, now. Reads the recorded id, waits for idle, types
// through crew/session-wake.sh, and keeps the failure counter in the session record. A mail to Boss is printed, not sent.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const home = crewHome()
  const kit = dirname(fileURLToPath(import.meta.url))
  const [key, cardId, ...words] = process.argv.slice(2)
  const text = words.join(' ')
  const bin = process.env.CREW_CLAUDE_BIN || 'claude'
  if (!key || !cardId || !text) {
    console.error('usage: node crew/wake.mjs <key> <card id> <text>')
    process.exit(64)
  }
  const record = readRecord(home, key)
  const list = listAgents({ bin })
  const out = await wakeOnce({
    record, list, text, cardId, key,
    type: ({ id, text: body }) => {
      const run = spawnSync('sh', [join(kit, 'session-wake.sh'), id, body], { encoding: 'utf8', timeout: 120000 })
      if (run.status !== 0) throw new Error(String(run.stderr || `exit ${run.status}`).trim().split('\n').pop())
    },
    readList: () => listAgents({ bin })
  })
  if (record) writeRecord(home, key, { ...record, wake: out.wake })
  console.log(out.reason)
  if (out.mailBoss) console.log(`MAIL BOSS (not sent by this command): ${out.mailBoss}`)
  process.exit(out.ok ? 0 : 1)
}
