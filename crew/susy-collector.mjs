// Susy daemon's evidence collector for the activity checks (card mwdbhbl2, Boss's requirements). It gathers, per person,
// the evidence personState and the Pia checks need, and returns the lines from susy-activity.mjs. It is light: it reads
// the cards the daemon already read (no extra board call), a few file times, the process list of `claude agents`, and
// /proc/loadavg. Any source that cannot be read is null, which the checks treat as no evidence (never a fault).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { authorKey } from './susy.mjs'
import { MIN, personState, workerLines, piaTriggerLines, escalationLines } from './susy-activity.mjs'

export const LOAD_LIMIT = 14
export const WORKERS = ['wren', 'wick', 'wynn', 'wade']

/** The session list from `claude agents --json`: [{ name, pid, kind, startedAt }], or null when it cannot be read. */
export function readSessions(run = spawnSync) {
  try {
    const out = run('claude', ['agents', '--json'], { encoding: 'utf8', timeout: 20000 })
    if (out.status !== 0) return null
    const list = JSON.parse(out.stdout)
    return Array.isArray(list) ? list : null
  } catch {
    return null
  }
}

/** Whether a person's session is running, found by the key in its session name (the way `mailbox.mjs where` finds it). */
export function sessionFor(key, sessions) {
  if (sessions === null) return null
  const match = sessions.find(a => (key === 'boss' ? a.name === 'taskmanager-maintenance' : String(a.name ?? '').toLowerCase().includes(key)))
  return match ? 'running' : 'gone'
}

/** The latest update time per person, from the cards already read: the author's key, the newest `at`. */
export function lastPostByPerson(cards) {
  const last = new Map()
  for (const card of cards) {
    for (const update of card.updates ?? []) {
      const key = authorKey(update.author)
      const at = Date.parse(update.at)
      if (!key || !Number.isFinite(at)) continue
      if (!last.has(key) || at > last.get(key)) last.set(key, at)
    }
  }
  return last
}

/** The minutes since the oldest undelivered mail in a person's folder, or null when the folder cannot be read. */
export function mailAgeMinutes(home, to, now) {
  const folder = join(home, 'mailbox', to)
  try {
    const files = readdirSync(folder).filter(f => f.endsWith('.json'))
    if (!files.length) return null
    const oldest = Math.min(...files.map(f => statSync(join(folder, f)).mtimeMs))
    return Math.floor((now - oldest) / MIN)
  } catch {
    return null
  }
}

/**
 * Whether Pia's listener process is running now (`pgrep -f "listen.mjs pia"`): true, false, or null when it cannot be asked.
 * The listener is a process that waits and exits, and is started again, so its presence is the signal, not a file time.
 */
export function listenerRunning(run = spawnSync) {
  try {
    const out = run('pgrep', ['-f', 'listen.mjs pia'], { encoding: 'utf8', timeout: 5000 })
    if (out.status === 0) return true
    if (out.status === 1) return false
    return null
  } catch {
    return null
  }
}

/**
 * The listener's heartbeat, sampled each tick: running now is age 0 and is the last time seen; not running is the minutes
 * since it was last seen. Null when it has never been seen or cannot be asked (no evidence, not a fault).
 */
export function listenerHeartbeat({ running, lastSeenAt, now }) {
  if (running === true) return { age: 0, seenAt: now }
  const seenAt = Number.isFinite(lastSeenAt) ? lastSeenAt : null
  if (running === null || seenAt === null) return { age: null, seenAt }
  return { age: Math.floor((now - seenAt) / MIN), seenAt }
}

/** A stable key for an activity line, so one condition is one key from tick to tick (the minutes in a line change). */
export function activityKey(line) {
  let m
  if ((m = /^poke (\S+) on (\S+):/.exec(line))) return `poke|${m[1]}|${m[2]}`
  if ((m = /^to pia: needs resume: (\S+) has (\S+)/.exec(line))) return `resume|${m[1]}|${m[2]}`
  if ((m = /^to pia: (\w+) trigger silent/.exec(line))) return `trigger|${m[1]}`
  if (/^to pia: a go is waiting/.test(line)) return 'go'
  if ((m = /^to boss: (\S+) "/.exec(line))) return `verify|${m[1]}`
  if (/^to boss: a QUESTION/.test(line)) return 'question'
  return `line|${line}`
}

/**
 * The activity lines that are new since the last tick, and the set to keep for the next one. A condition that is still
 * there is not logged again; a condition that clears is dropped, so a later return is new again.
 */
export function newActivityLines(lines, previous = {}) {
  const pending = {}
  const fresh = []
  for (const line of lines) {
    const key = activityKey(line)
    pending[key] = line
    if (!(key in previous)) fresh.push(line)
  }
  return { fresh, pending }
}

/** The one-minute load, from /proc/loadavg, or null when it cannot be read. */
export function readLoad(path = '/proc/loadavg') {
  try {
    return Number(readFileSync(path, 'utf8').split(' ')[0])
  } catch {
    return null
  }
}

/**
 * The evidence for one tick, then the lines. `state.loadUnderSince` is kept across ticks: the time load has been under the
 * limit (reset when it goes over). `cards` are the cards the daemon already read; `keyOf` maps a display name to a key.
 */
export function collectActivity({ now, home, cards, sessions, load, state = {}, keyOf, listenerRunning: running = null }) {
  const lastPost = lastPostByPerson(cards)
  const loadUnderSince = load !== null && load < LOAD_LIMIT ? (state.loadUnderSince ?? now) : null
  const people = WORKERS.map(key => {
    const session = sessionFor(key, sessions)
    const last = lastPost.get(key)
    const lastActivityMs = last ?? null
    const card = cards.find(c => c.column === 'In progress' && keyOf(c.assignee) === key) ?? null
    const state2 = personState({ session: session ?? 'running', lastActivityMs, waiting: false, now })
    return {
      key,
      card: card ? { id: card.id, title: card.title } : null,
      blocked: Boolean(card?.blocked),
      state: session === null ? 'unknown' : state2,
      idleMs: lastActivityMs === null ? null : now - lastActivityMs,
      lastUpdate: card?.updates?.at(-1)?.body ?? null
    }
  }).filter(p => p.state !== 'unknown')

  const pia = sessionFor('pia', sessions)
  const heartbeat = listenerHeartbeat({ running, lastSeenAt: state.listenerSeenAt ?? null, now })
  const ages = {
    listener: heartbeat.age,
    roundTimer: lastPost.has('pia') ? Math.floor((now - lastPost.get('pia')) / MIN) : null,
    mailUnread: mailAgeMinutes(home, 'pia', now),
    handback: null,
    unassigned: null
  }
  const todoUnassigned = cards.filter(c => c.column === 'To do' && !c.assignee)
  const anyWorkerIdle = people.some(p => p.state === 'idle')
  ages.unassigned = todoUnassigned.length && anyWorkerIdle ? Math.floor((now - Math.min(...todoUnassigned.map(c => c.updatedAt ?? now))) / MIN) : null

  const verifyCards = cards
    .filter(c => /^Verify/.test(c.column) && Number.isFinite(c.updatedAt))
    .map(c => ({ id: c.id, title: c.title, column: c.column, minutes: Math.floor((now - c.updatedAt) / MIN) }))
  const lines = [
    ...workerLines(people),
    ...piaTriggerLines(ages),
    ...escalationLines({
      goWaitMinutes: null,
      loadUnder14Minutes: loadUnderSince === null ? 0 : Math.floor((now - loadUnderSince) / MIN),
      verifyCards,
      questionMinutes: null
    })
  ]
  return { lines, people, ages, loadUnderSince, listenerSeenAt: heartbeat.seenAt, pia }
}
