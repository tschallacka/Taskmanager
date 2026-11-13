#!/usr/bin/env node
// Susy as a daemon: a process with no model in the loop. One tick reads the board with Susy's own key, runs the same
// round as `crew susy check` (findPokes in susy.mjs), and acts on what it finds.
//   crew susy-daemon once [--live]                one tick
//   crew susy-daemon loop [sec] [--live]          a tick every 60 seconds (or sec)
//   crew susy-daemon status                       the heartbeat and the log's last lines
// Dry-run (the default) writes nothing to the board and sends no mail: it logs what it would post, once per new action,
// to .listen/susy-daemon-dryrun.log. Live (--live) posts each new action on its card as Susy (post_task_update, internal:
// the poke marker, then one line naming the person), and mails Boss through the app's mail route when the board or the
// key does not answer. A post that fails is tried again on the next tick. The heartbeat (.listen/susy-daemon.json) is
// written each tick in both modes. Nothing crashes the loop.
// Files in CREW_HOME/.listen: susy-daemon.json, susy-daemon-dryrun.log, and susy.json (agent ids and the last round,
// shared with `crew susy`).
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { crewHome } from './home.mjs'
import { DEFAULT_CLEANER, findPokes, keyOfName, makeCall, readBoardCards } from './susy.mjs'
import { collectActivity, listenerRunning, newActivityLines, readLoad } from './susy-collector.mjs'
import { projectsRoot, readWorkerRows, workerStates } from './susy-workers.mjs'
import { markMailed, sessionErrorReport } from './session-errors.mjs'

export const TICK_SECONDS = 60

// The key of one pending action: the same card, reason and person is the same action from tick to tick.
export function pendingKey(action) {
  return [action.kind, action.cardId, action.reason, action.to ?? ''].join('|')
}

/** The text Susy posts for an action on its card: the marker line first (the ledger reads it), then the one thing to say. */
export function postBody(action) {
  if (action.kind !== 'poke') return action.marker
  const mention = action.to === 'boss' ? '@cato' : `@${action.to}`
  const say = action.text.replace(/^.*?\. Say: /, '').replace(/^"/, '').replace(/" \(to [^)]*\)$/, '')
  return `${action.marker}\n\n${mention} ${say}`
}

/**
 * One tick over the board's cards. Returns the new state, the lines this tick adds (one per new action, and one when a
 * creds or board error starts or clears), and `fresh`: the actions new since the last tick, which live mode posts.
 * `readCards` is async and may throw; `now` is milliseconds.
 */
export async function tick({ now, crew, readCards, state = {}, agents = {} }) {
  const next = { ...state, pending: { ...(state.pending ?? {}) } }
  const lines = []
  let cards
  try {
    cards = await readCards()
  } catch (error) {
    const reason = error.message || 'the board did not answer'
    const streak = next.errorReason === reason
    next.errorReason = reason
    next.errorStreak = streak ? (next.errorStreak ?? 1) + 1 : 1
    lines.push(`susy-daemon: ${reason}`)
    const mailBoss = !streak || next.mailedFor !== reason
    if (mailBoss) {
      lines.push(`mail boss once: susy-daemon has no board answer: ${reason}`)
      next.mailedFor = reason
    }
    return { state: next, lines, ok: false, error: reason, actions: 0, fresh: [], mailBoss: mailBoss ? reason : null }
  }
  if (next.errorReason) {
    lines.push(`susy-daemon: back to normal (was: ${next.errorReason})`)
  }
  delete next.errorReason
  delete next.errorStreak
  delete next.mailedFor

  const round = findPokes(cards, {
    now,
    thresholds: crew?.susy,
    keyOf: keyOfName(crew?.people),
    cleaner: crew?.susy?.cleaner ?? DEFAULT_CLEANER,
    agents
  })
  const current = {}
  const fresh = []
  for (const action of round.actions) {
    const key = pendingKey(action)
    current[key] = action.text
    if (!next.pending[key]) {
      fresh.push(action)
      lines.push(`would ${action.kind}: ${action.text}`)
    }
  }
  next.pending = current
  return { state: next, lines, ok: true, error: null, actions: round.actions.length, fresh, mailBoss: null, cards }
}

function readJson(path, fallback) {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback
  } catch {
    return fallback
  }
}

function heartbeatPath(home) {
  return `${home}/.listen/susy-daemon.json`
}

function writeHeartbeat(home, heartbeat) {
  mkdirSync(`${home}/.listen`, { recursive: true })
  writeFileSync(heartbeatPath(home), `${JSON.stringify(heartbeat, null, 2)}\n`, { mode: 0o600 })
}

/**
 * Live only: posts each fresh action as Susy on its card. A post that fails is taken back out of pending, so the next
 * tick sees the action as new and tries again. Returns the lines to log.
 */
export async function postFresh({ fresh, pending, call }) {
  const lines = []
  for (const action of fresh) {
    const key = pendingKey(action)
    try {
      await call('post_task_update', { id: action.cardId, body: postBody(action), visibility: 'internal' })
      lines.push(`posted: ${action.kind} ${action.cardId} ${action.reason}`)
    } catch (error) {
      delete pending[key]
      lines.push(`could not post ${action.kind} on ${action.cardId}, tried again next tick: ${error.message}`)
    }
  }
  return lines
}

/** One tick from the files of CREW_HOME: reads the config, the key and the board, acts (live) and logs. */
export async function runOnce(home, now = Date.now(), { live = false } = {}) {
  const stored = readJson(heartbeatPath(home), {})
  const state = stored.state ?? {}
  const crew = readJson(`${home}/crew.json`, null) ?? readJson(`${home}/crew.config.json`, null)
  const creds = readJson(`${home}/creds.json`, {})
  const susyState = readJson(`${home}/.listen/susy.json`, {})
  const key = process.env.SUSY_API_KEY || creds.people?.susy?.apiKey
  const call = key ? makeCall(creds.base, key) : null
  const readCards = async () => {
    if (!crew) throw new Error(`no crew.json in ${home}`)
    if (!key) throw new Error('no account yet (no people.susy in creds.json)')
    return readBoardCards(call, creds.board?.id)
  }
  const result = await tick({ now, crew, readCards, state, agents: susyState.agents })
  // The activity checks: evidence from the cards already read, the session list, the mail folders, the listener's sampled
  // heartbeat and the load. A condition is logged when it starts, not on every tick it holds (newActivityLines). Logged in
  // both modes; live mode does not act on them yet. A source that cannot be read is silent.
  // The workers are read from their own transcripts (Pia's project folder: CREW_PROJECTS, or crew.json "activity", or the
  // folder of the crew home). A missing folder or an unreadable transcript is no evidence.
  const workerRows = result.ok ? readWorkerRows({ root: projectsRoot({ crewHome: home, crew }), now }) : new Map()
  const activity = result.ok
    ? collectActivity({ now, home, cards: result.cards ?? [], rows: workerRows, load: readLoad(), state, keyOf: keyOfName(crew?.people), listenerRunning: listenerRunning({ home }) })
    : null
  const repeats = newActivityLines(activity?.lines ?? [], state.activity)
  result.state.activity = repeats.pending
  result.state.loadUnderSince = activity?.loadUnderSince ?? undefined
  result.state.listenerSeenAt = activity?.listenerSeenAt ?? undefined
  const lines = [...result.lines, ...repeats.fresh]
  // The API-error check (card mwdblb506deyxnet5i7): a session whose last transcript line is an API error is blocked, not
  // stuck. Boss gets one mail per distinct error text; a later normal line clears it. Mails go out only in live mode.
  const errors = sessionErrorReport({ home, root: projectsRoot({ crewHome: home, crew }), state: result.state, live })
  result.state.sessionErrors = errors.sessionErrors
  lines.push(...errors.lines)
  if (live) {
    for (const item of errors.pending) {
      try {
        const { sendMail } = await import('./mail-client.mjs')
        await sendMail({ base: creds.base, slug: creds.crew?.slug, key, to: 'boss', text: item.text, mailboxDir: `${home}/mailbox`, makeId: () => crypto.randomUUID().replaceAll('-', '') })
        // Marked seen only now, after the send succeeded, so a failed send is tried again on the next live tick.
        result.state.sessionErrors = markMailed(result.state.sessionErrors, item.key, item.error)
        lines.push('mailed boss: api error')
      } catch (error) {
        lines.push(`could not mail boss about an api error: ${error.message}`)
      }
    }
    lines.push(...await postFresh({ fresh: result.fresh, pending: result.state.pending, call }))
    if (result.mailBoss && key && creds.crew?.slug) {
      try {
        // The mail client ships with the kit once the mailer branch is merged; loaded here so dry-run never needs it.
        const { sendMail } = await import('./mail-client.mjs')
        await sendMail({ base: creds.base, slug: creds.crew.slug, key, to: 'boss', text: result.mailBoss, mailboxDir: `${home}/mailbox`, makeId: () => crypto.randomUUID().replaceAll('-', '') })
        lines.push('mailed boss through the app')
      } catch (error) {
        lines.push(`could not mail boss through the app: ${error.message}`)
      }
    }
  }
  const at = new Date(now).toISOString()
  const logLines = lines.map(line => `${at} ${line}`)
  if (logLines.length) {
    mkdirSync(`${home}/.listen`, { recursive: true })
    appendFileSync(`${home}/.listen/susy-daemon-dryrun.log`, `${logLines.join('\n')}\n`, { mode: 0o600 })
  }
  const heartbeat = {
    time: at,
    mode: live ? 'live' : 'dry-run',
    ticks: (stored.ticks ?? 0) + 1,
    lastTick: { at, ok: result.ok, actions: result.actions, error: result.error },
    pending: Object.keys(result.state.pending).length,
    state: result.state,
    // Requirement 1: each person's activity state, for Boss's watch and the office view.
    // Boss's names for each worker (working, running, listening, ended, handedback, silent), from the transcripts.
    workers: result.ok ? workerStates({ rows: workerRows }) : undefined,
    people: activity ? activity.people.map(p => ({ key: p.key, state: p.state, idleMinutes: p.idleMs === null ? null : Math.floor(p.idleMs / 60000) })) : undefined,
    ages: activity?.ages
  }
  writeHeartbeat(home, heartbeat)
  for (const line of lines) console.log(line)
  return { ...result, lines }
}

// Boss's watch alarms when the heartbeat is older than this (card mwdbhbl2, step 3).
export const STALE_MINUTES = 3
export const SESSION = 'susy-daemon'

/** Minutes since the heartbeat's last tick, or null when there is no heartbeat time. */
export function heartbeatAgeMinutes(heartbeat, now = Date.now()) {
  const at = Date.parse(heartbeat?.time)
  return Number.isFinite(at) ? Math.floor((now - at) / 60000) : null
}

/** Fresh when the last tick is within STALE_MINUTES. No heartbeat, or an unreadable one, is not fresh. */
export function heartbeatFresh(heartbeat, now = Date.now()) {
  const age = heartbeatAgeMinutes(heartbeat, now)
  return age !== null && age >= 0 && age <= STALE_MINUTES
}

/** One word for a POSIX shell: single quotes, with any single quote written as '\'' so paths with spaces or quotes survive. */
export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

/**
 * The command for start and stop, as argv (not run here): start puts the loop in a detached tmux session through
 * crew/detach.sh, so it outlives the session that started it; stop kills that session. `kit` is the folder of this file.
 */
export function daemonCommand(home, action, { kit, live = false }) {
  const socket = `${home}/tmux.sock`
  if (action === 'stop') return ['tmux', ['-S', socket, 'kill-session', '-t', SESSION]]
  if (action !== 'start') throw new Error(`no such action: ${action}`)
  const loop = `CREW_HOME=${shellQuote(home)} ${shellQuote(process.execPath)} ${shellQuote(join(kit, 'susy-daemon.mjs'))} loop${live ? ' --live' : ''}`
  return ['sh', [join(kit, 'detach.sh'), 'start', socket, SESSION, loop]]
}

/** `status`: the heartbeat in one line, whether it is fresh, and the log's last lines. */
export function statusLines(home, now = Date.now()) {
  const heartbeat = readJson(heartbeatPath(home), null)
  if (!heartbeat) return ['susy-daemon: no heartbeat yet (it has not run a tick)']
  const ageMinutes = heartbeatAgeMinutes(heartbeat, now) ?? 0
  const freshness = heartbeatFresh(heartbeat, now) ? 'fresh' : `STALE (older than ${STALE_MINUTES} min)`
  const out = [`susy-daemon ${heartbeat.mode}: tick ${heartbeat.ticks}, last ${ageMinutes} min ago (${freshness}), ${heartbeat.pending} pending, last tick ${heartbeat.lastTick?.ok ? 'ok' : `failed: ${heartbeat.lastTick?.error}`}`]
  const logPath = `${home}/.listen/susy-daemon-dryrun.log`
  if (existsSync(logPath)) out.push(...readFileSync(logPath, 'utf8').trimEnd().split('\n').slice(-5))
  return out
}

// The single-instance lock: one loop at a time, and no `once --live` while a loop runs. The pid file names the loop's
// process; a pid that is dead, or is not a susy-daemon process, is stale and is taken over.
export const LOCK_NAME = 'susy-daemon.pid'

/** Whether a pid is a live susy-daemon process: it exists, and its command line names this daemon. */
export function isDaemonPid(pid, readCmdline = p => readFileSync(`/proc/${p}/cmdline`, 'utf8')) {
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  try {
    return readCmdline(pid).includes('susy-daemon.mjs')
  } catch {
    return false
  }
}

/** `free` (no pid file), `stale` (a pid file whose pid is not a live daemon), or `held` (a live daemon's pid). */
export function lockState(home, { isDaemon = pid => isDaemonPid(pid) } = {}) {
  const file = join(home, '.listen', LOCK_NAME)
  if (!existsSync(file)) return { state: 'free' }
  const pid = Number(readFileSync(file, 'utf8').trim())
  if (!Number.isInteger(pid) || pid <= 0 || !isDaemon(pid)) return { state: 'stale', pid: Number.isInteger(pid) ? pid : null }
  return { state: 'held', pid }
}

/** Takes the lock for this process. Refused (`ok: false`) while another live daemon holds it; a stale pid is taken over. */
export function takeLock(home, { isDaemon, pid = process.pid } = {}) {
  const current = lockState(home, { isDaemon })
  if (current.state === 'held' && current.pid !== pid) return { ok: false, heldBy: current.pid }
  mkdirSync(join(home, '.listen'), { recursive: true })
  writeFileSync(join(home, '.listen', LOCK_NAME), `${pid}\n`, { mode: 0o600 })
  return { ok: true, tookOverStale: current.state === 'stale' ? current.pid : null }
}

/** Releases the lock if this process holds it. */
export function releaseLock(home, pid = process.pid) {
  const file = join(home, '.listen', LOCK_NAME)
  try {
    if (Number(readFileSync(file, 'utf8').trim()) === pid) rmSync(file)
  } catch {
    // no lock file: nothing to release
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * The part for crew.json's "up" list (crew/up.mjs): `check` exits 0 while the daemon's heartbeat is fresh, `start`
 * starts the loop in its detached session (with --live when asked). Printed by `crew susy-daemon up-part`; Boss puts it
 * in crew.json, the kit does not edit crew.json.
 */
export function upPart({ home, kit, live = false, node = process.execPath }) {
  const daemon = join(kit, 'susy-daemon.mjs')
  return {
    name: live ? 'susy daemon (live)' : 'susy daemon (dry-run)',
    check: `CREW_HOME=${JSON.stringify(home)} ${JSON.stringify(node)} ${JSON.stringify(daemon)} check`,
    start: `CREW_HOME=${JSON.stringify(home)} ${JSON.stringify(node)} ${JSON.stringify(daemon)} start${live ? ' --live' : ''}`
  }
}

async function main(argv) {
  const home = crewHome()
  const [command, ...rest] = argv
  if (command === 'status') {
    console.log(statusLines(home).join('\n'))
    return 0
  }
  if (command === 'check') {
    // The up-part check: exit 0 only when the heartbeat's tick time is younger than STALE_MINUTES. No text is matched.
    return heartbeatFresh(readJson(heartbeatPath(home), null)) ? 0 : 1
  }
  if (command === 'up-part') {
    console.log(JSON.stringify(upPart({ home, kit: dirname(fileURLToPath(import.meta.url)), live: rest.includes('--live') }), null, 2))
    return 0
  }
  const kit = dirname(fileURLToPath(import.meta.url))
  if (command === 'start' || command === 'stop') {
    // start: the loop in its own detached session (crew/detach.sh, which keeps it when the calling session ends);
    // stop: that session is killed. Start is a no-op when the session exists (detach.sh checks it).
    const [file, args] = daemonCommand(home, command, { kit, live: rest.includes('--live') })
    const run = spawnSync(file, args, { encoding: 'utf8', timeout: 60000 })
    const text = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim()
    console.log(text || `susy-daemon: ${command} done`)
    return run.status ?? 1
  }
  if (command !== 'once' && command !== 'loop') {
    console.error('usage: crew susy-daemon once | loop [sec] | start | stop | status   (--live acts on the board: once --live, loop --live, start --live)')
    return 64
  }
  const live = rest.includes('--live')
  if (command === 'once' && !live) {
    await runOnce(home, Date.now(), { live: false })
    return 0
  }
  // The lock: a loop always holds it, and a once --live takes it for its one tick. A second loop, or a once --live while a
  // loop runs, is refused. A pid file whose process is gone is taken over.
  const lock = takeLock(home)
  if (!lock.ok) {
    console.error(`susy-daemon: refused: a loop already runs (pid ${lock.heldBy}); one loop at a time, and no once --live while it runs`)
    return 75
  }
  if (lock.tookOverStale) console.log(`susy-daemon: took over a stale lock (pid ${lock.tookOverStale})`)
  const stop = () => {
    releaseLock(home)
    process.exit(0)
  }
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, stop)
  process.on('exit', () => releaseLock(home))
  if (command === 'once') {
    await runOnce(home, Date.now(), { live: true })
    return 0
  }
  const seconds = Number(rest.find(arg => /^\d+$/.test(arg))) || TICK_SECONDS
  for (;;) {
    try {
      await runOnce(home, Date.now(), { live })
    } catch (error) {
      console.log(`susy-daemon: tick failed: ${error.message}`)
    }
    await sleep(seconds * 1000)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((code) => {
    if (code) process.exitCode = code
  })
}
