#!/usr/bin/env node
// Susy as a daemon: a process with no model in the loop. One tick reads the board with Susy's own key, runs the same
// round as `crew susy check` (findPokes in susy.mjs), and records what it WOULD post. This build is dry-run only: it
// writes nothing to the board, sends no mail and starts nothing. The Claude Susy session keeps running beside it until
// the daemon has run a clean hour in dry-run.
//   crew susy-daemon once                one tick
//   crew susy-daemon loop [sec]          a tick every 60 seconds (or sec)
//   crew susy-daemon status              the heartbeat and the dry-run log's last lines
// Files in CREW_HOME/.listen: susy-daemon.json (the heartbeat, written each tick), susy-daemon-dryrun.log (one line per
// action that is new, the first time it is seen), and susy.json (agent ids and the last round, shared with `crew susy`).
// A live mode is not built: `--live` is refused. Creds trouble (no key, board not answering): one line, one dry-run
// "would mail Boss" line for the streak, and the tick repeats quietly until a good tick. Nothing crashes the loop.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { crewHome } from './home.mjs'
import { DEFAULT_CLEANER, findPokes, keyOfName, makeCall, readBoardCards } from './susy.mjs'

export const TICK_SECONDS = 60
export const MODE = 'dry-run'

// The key of one pending action: the same card, reason and person is the same action from tick to tick.
export function pendingKey(action) {
  return [action.kind, action.cardId, action.reason, action.to ?? ''].join('|')
}

/**
 * One tick over the board's cards. Returns the new state and the lines this tick adds: one line per action that
 * is new since the last tick, and one line when a creds or board error starts (and when it clears). `readCards` is
 * async and may throw; `now` is milliseconds.
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
    if (!streak || next.mailedFor !== reason) {
      lines.push(`would mail boss once: susy-daemon has no board answer: ${reason}`)
      next.mailedFor = reason
    }
    return { state: next, lines, ok: false, error: reason, actions: 0 }
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
  for (const action of round.actions) {
    const key = pendingKey(action)
    current[key] = action.text
    if (!next.pending[key]) lines.push(`would ${action.kind}: ${action.text}`)
  }
  next.pending = current
  return { state: next, lines, ok: true, error: null, actions: round.actions.length }
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

/** One tick from the files of CREW_HOME: reads the config, the key and the board, then logs and writes the heartbeat. */
export async function runOnce(home, now = Date.now()) {
  const stored = readJson(heartbeatPath(home), {})
  const state = stored.state ?? {}
  const crew = readJson(`${home}/crew.json`, null) ?? readJson(`${home}/crew.config.json`, null)
  const creds = readJson(`${home}/creds.json`, {})
  const susyState = readJson(`${home}/.listen/susy.json`, {})
  const key = process.env.SUSY_API_KEY || creds.people?.susy?.apiKey
  const readCards = async () => {
    if (!crew) throw new Error(`no crew.json in ${home}`)
    if (!key) throw new Error('no account yet (no people.susy in creds.json)')
    return readBoardCards(makeCall(creds.base, key), creds.board?.id)
  }
  const result = await tick({ now, crew, readCards, state, agents: susyState.agents })
  const at = new Date(now).toISOString()
  const logLines = result.lines.map(line => `${at} ${line}`)
  if (logLines.length) {
    mkdirSync(`${home}/.listen`, { recursive: true })
    appendFileSync(`${home}/.listen/susy-daemon-dryrun.log`, `${logLines.join('\n')}\n`, { mode: 0o600 })
  }
  const heartbeat = {
    time: at,
    mode: MODE,
    ticks: (stored.ticks ?? 0) + 1,
    lastTick: { at, ok: result.ok, actions: result.actions, error: result.error },
    pending: Object.keys(result.state.pending).length,
    state: result.state
  }
  writeHeartbeat(home, heartbeat)
  for (const line of result.lines) console.log(line)
  return result
}

/** `status`: the heartbeat in one line, and the dry-run log's last lines. */
export function statusLines(home, now = Date.now()) {
  const heartbeat = readJson(heartbeatPath(home), null)
  if (!heartbeat) return ['susy-daemon: no heartbeat yet (it has not run a tick)']
  const ageMinutes = Math.floor((now - Date.parse(heartbeat.time)) / 60000)
  const out = [`susy-daemon ${heartbeat.mode}: tick ${heartbeat.ticks}, last ${ageMinutes} min ago, ${heartbeat.pending} pending, last tick ${heartbeat.lastTick?.ok ? 'ok' : `failed: ${heartbeat.lastTick?.error}`}`]
  const logPath = `${home}/.listen/susy-daemon-dryrun.log`
  if (existsSync(logPath)) out.push(...readFileSync(logPath, 'utf8').trimEnd().split('\n').slice(-5))
  return out
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function main(argv) {
  const home = crewHome()
  const [command, ...rest] = argv
  if (command === 'status') {
    console.log(statusLines(home).join('\n'))
    return 0
  }
  if (command !== 'once' && command !== 'loop') {
    console.error('usage: crew susy-daemon once | loop [sec] | status')
    return 64
  }
  if (rest.includes('--live')) {
    console.error('susy-daemon: live mode is not built; this build is dry-run only')
    return 64
  }
  if (command === 'once') {
    await runOnce(home)
    return 0
  }
  const seconds = Number(rest.find(arg => /^\d+$/.test(arg))) || TICK_SECONDS
  for (;;) {
    try {
      await runOnce(home)
    } catch (error) {
      console.log(`susy-daemon: tick failed: ${error.message}`)
    }
    await sleep(seconds * 1000)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(code => {
    if (code) process.exitCode = code
  })
}
