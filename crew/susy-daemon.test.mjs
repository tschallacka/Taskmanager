// crew susy-daemon: one tick with a fake board and a fake clock. Dry-run only: a tick reads and logs, it posts nothing.
// Run: node --test crew/susy-daemon.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { tick, pendingKey, postBody, postFresh, runOnce, statusLines, heartbeatAgeMinutes, heartbeatFresh, daemonCommand, shellQuote, SESSION, upPart, isDaemonPid, lockState, takeLock, releaseLock, LOCK_NAME } from './susy-daemon.mjs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const MIN = 60000
const T0 = Date.parse('2026-11-12T10:00:00.000Z')
const CREW = { people: {}, susy: {} }

// A card in In progress by Wick, last changed 30 minutes ago, with no update of its own: a "no update" poke is due.
function stuckCard(now) {
  return {
    id: 'c1', title: 'Build the thing', column: 'In progress', assignee: 'Wick Worker', tags: [], completed: false,
    updatedAt: now - 30 * MIN, blocked: false, blockedBy: [], updates: []
  }
}

test('a poke that is due is logged as would-poke once; the next tick with the same pending action logs nothing new', async () => {
  let now = T0
  const readCards = async () => [stuckCard(now)]
  const first = await tick({ now, crew: CREW, readCards, state: {} })
  assert.equal(first.ok, true)
  const wouldPoke = first.lines.filter(line => line.startsWith('would poke'))
  assert.equal(wouldPoke.length, 1, first.lines.join('\n'))
  assert.match(wouldPoke[0], /in progress, no update|no update/)
  now += 60000
  const second = await tick({ now, crew: CREW, readCards, state: first.state })
  assert.deepEqual(second.lines.filter(line => line.startsWith('would')), [])
  assert.equal(Object.keys(second.state.pending).length, 1)
})

test('a board that does not answer: one line, one would-mail-Boss line for the streak, then quiet', async () => {
  const readCards = async () => {
    throw new Error('get_board answered HTTP 503')
  }
  const first = await tick({ now: T0, crew: CREW, readCards, state: {} })
  assert.equal(first.ok, false)
  assert.deepEqual(first.lines, [
    'susy-daemon: get_board answered HTTP 503',
    'mail boss once: susy-daemon has no board answer: get_board answered HTTP 503'
  ])
  const second = await tick({ now: T0 + MIN, crew: CREW, readCards, state: first.state })
  assert.deepEqual(second.lines, ['susy-daemon: get_board answered HTTP 503'])
  assert.equal(second.state.errorStreak, 2)
})

test('a good tick after errors says the board is back, and a new error mails Boss again', async () => {
  let fail = true
  const readCards = async () => {
    if (fail) throw new Error('no account yet')
    return []
  }
  const bad = await tick({ now: T0, crew: CREW, readCards, state: {} })
  fail = false
  const good = await tick({ now: T0 + MIN, crew: CREW, readCards, state: bad.state })
  assert.equal(good.ok, true)
  assert.match(good.lines[0], /back to normal \(was: no account yet\)/)
  assert.equal(good.state.errorStreak, undefined)
  fail = true
  const again = await tick({ now: T0 + 2 * MIN, crew: CREW, readCards, state: good.state })
  assert.ok(again.lines.some(line => line.startsWith('mail boss once')))
})

test('a pending action that stops being needed drops out of pending, so a later one is logged again', async () => {
  let now = T0
  const readCards = async () => [stuckCard(now)]
  const first = await tick({ now, crew: CREW, readCards, state: {} })
  const key = Object.keys(first.state.pending)[0]
  assert.ok(key)
  assert.equal(key, pendingKey({ kind: 'poke', cardId: 'c1', reason: 'in progress, no update', to: 'wick' }))
  // The card gets an update from Wick: the reason ends.
  const done = await tick({ now: now + MIN, crew: CREW, readCards: async () => [{ ...stuckCard(now), updatedAt: now + MIN, updates: [{ id: 'u1', author: 'crew wick (agent)', body: 'working', at: new Date(now + MIN).toISOString() }] }], state: first.state })
  assert.equal(Object.keys(done.state.pending).length, 0)
})

test('the heartbeat and the dry-run log are written by a tick, and status reads them back', async () => {
  const home = mkdtempSync(join(tmpdir(), 'susy-daemon-'))
  mkdirSync(join(home, '.listen'), { recursive: true })
  writeFileSync(join(home, 'crew.json'), JSON.stringify({ people: {}, susy: {} }))
  // No creds.json: the tick finds no account, logs it, and writes the heartbeat.
  const result = await runOnce(home, T0)
  assert.equal(result.ok, false)
  const heartbeat = JSON.parse(readFileSync(join(home, '.listen', 'susy-daemon.json'), 'utf8'))
  assert.equal(heartbeat.mode, 'dry-run')
  assert.equal(heartbeat.ticks, 1)
  assert.equal(heartbeat.lastTick.ok, false)
  const log = readFileSync(join(home, '.listen', 'susy-daemon-dryrun.log'), 'utf8')
  assert.match(log, /no account yet/)
  const status = statusLines(home, T0 + 2 * MIN)
  assert.match(status[0], /dry-run: tick 1, last 2 min ago/)
  await runOnce(home, T0 + MIN)
  assert.equal(JSON.parse(readFileSync(join(home, '.listen', 'susy-daemon.json'), 'utf8')).ticks, 2)
})

test('a poke is posted as its marker line, then one line naming the person; a clear is the marker alone', () => {
  const poke = { kind: 'poke', to: 'wick', reason: 'in progress, no update', cardId: 'c1', marker: 'poked wick | in progress, no update | at 2026-11-12T10:00:00.000Z', text: 'poke @wick on c1 "Build": in progress, no update (30 min; SendMessage to agent x). Say: "post what you did on c1 "Build" or move it back to To do" (to wick)' }
  const body = postBody(poke)
  assert.equal(body.split('\n')[0], poke.marker)
  assert.match(body, /^@wick post what you did on c1/m)
  const clear = { kind: 'clear', marker: 'cleared wick | in progress, no update | at 2026-11-12T10:20:00.000Z', text: 'clear' }
  assert.equal(postBody(clear), clear.marker)
})

test('live posting: a post that works is logged as posted; one that fails is taken back out of pending for the next tick', async () => {
  const fresh = [
    { kind: 'clear', cardId: 'c1', reason: 'r', to: undefined, marker: 'cleared x', text: 'clear' },
    { kind: 'clear', cardId: 'c2', reason: 'r', to: undefined, marker: 'cleared y', text: 'clear' }
  ]
  const pending = Object.fromEntries(fresh.map(a => [pendingKey(a), a.text]))
  const calls = []
  const call = async (name, args) => {
    calls.push([name, args.id])
    if (args.id === 'c2') throw new Error('post_task_update answered HTTP 503')
    return {}
  }
  const lines = await postFresh({ fresh, pending, call })
  assert.deepEqual(calls.map(c => c[0]), ['post_task_update', 'post_task_update'])
  assert.equal(lines[0], 'posted: clear c1 r')
  assert.match(lines[1], /could not post clear on c2, tried again next tick: post_task_update answered HTTP 503/)
  assert.ok(pendingKey(fresh[0]) in pending, 'the posted action stays pending')
  assert.ok(!(pendingKey(fresh[1]) in pending), 'the failed one is taken back out')
})

test('the heartbeat is fresh within 3 minutes and stale after; no heartbeat time is not fresh', () => {
  const now = Date.parse('2026-11-12T12:00:00.000Z')
  assert.equal(heartbeatFresh({ time: new Date(now - 2 * MIN).toISOString() }, now), true)
  assert.equal(heartbeatFresh({ time: new Date(now - 3 * MIN).toISOString() }, now), true)
  assert.equal(heartbeatFresh({ time: new Date(now - 4 * MIN).toISOString() }, now), false)
  assert.equal(heartbeatFresh({}, now), false)
  assert.equal(heartbeatAgeMinutes({ time: 'nonsense' }, now), null)
})

test('start puts the dry-run loop in its own detached session through detach.sh; stop kills that session', () => {
  const [file, args] = daemonCommand('/crew/home', 'start', { kit: '/kit' })
  assert.equal(file, 'sh')
  assert.deepEqual(args.slice(0, 4), ['/kit/detach.sh', 'start', '/crew/home/tmux.sock', SESSION])
  assert.match(args[4], /susy-daemon\.mjs' loop$/)
  assert.doesNotMatch(args[4], /--live/)
  const [, liveArgs] = daemonCommand('/crew/home', 'start', { kit: '/kit', live: true })
  assert.match(liveArgs[4], /loop --live$/)
  const [stopFile, stopArgs] = daemonCommand('/crew/home', 'stop', { kit: '/kit' })
  assert.equal(stopFile, 'tmux')
  assert.deepEqual(stopArgs, ['-S', '/crew/home/tmux.sock', 'kill-session', '-t', SESSION])
  assert.throws(() => daemonCommand('/crew/home', 'restart', { kit: '/kit' }), /no such action/)
})

test('the paths in the loop command are quoted, so a home or kit folder with spaces or quotes is one word each', () => {
  const [, args] = daemonCommand('/crew home/it\'s', 'start', { kit: '/my kit', live: true })
  assert.equal(args[4], `CREW_HOME='/crew home/it'\\''s' ${shellQuote(process.execPath)} '/my kit/susy-daemon.mjs' loop --live`)
  assert.equal(shellQuote('plain'), '\'plain\'')
})

test('the up part: its check passes on a fresh heartbeat and fails on a stale one; only the live part starts with --live', () => {
  const kit = dirname(fileURLToPath(import.meta.url))
  const home = mkdtempSync(join(tmpdir(), 'susy-up-'))
  mkdirSync(join(home, '.listen'), { recursive: true })
  const part = upPart({ home, kit })
  const writeAt = minutesAgo => writeFileSync(join(home, '.listen', 'susy-daemon.json'), JSON.stringify({ time: new Date(Date.now() - minutesAgo * MIN).toISOString(), mode: 'dry-run', ticks: 1, lastTick: { ok: true }, pending: 0 }))
  writeAt(0)
  assert.equal(spawnSync('sh', ['-c', part.check], { encoding: 'utf8' }).status, 0, 'fresh: the check passes')
  writeAt(10)
  assert.notEqual(spawnSync('sh', ['-c', part.check], { encoding: 'utf8' }).status, 0, 'stale: the check fails')
  assert.doesNotMatch(part.start, /--live/)
  assert.match(upPart({ home, kit, live: true }).start, / start --live$/)
  assert.equal(upPart({ home, kit, live: true }).name, 'susy daemon (live)')
})

test('the lock: one loop at a time; a live holder refuses; a stale pid is taken over; release only what this process holds', () => {
  const home = mkdtempSync(join(tmpdir(), 'susy-lock-'))
  const live = pid => pid === 4242
  const dead = () => false
  assert.equal(lockState(home, { isDaemon: dead }).state, 'free')
  assert.equal(takeLock(home, { isDaemon: dead, pid: 111 }).ok, true)
  assert.equal(readFileSync(join(home, '.listen', LOCK_NAME), 'utf8').trim(), '111')
  // A second loop, while 111 is alive: refused. (Here 111 is treated as a live daemon.)
  assert.deepEqual(takeLock(home, { isDaemon: pid => pid === 111, pid: 222 }), { ok: false, heldBy: 111 })
  // A stale pid (its process is not a daemon any more): taken over.
  const over = takeLock(home, { isDaemon: dead, pid: 333 })
  assert.equal(over.ok, true)
  assert.equal(over.tookOverStale, 111)
  // A held lock is not released by another process.
  releaseLock(home, 111)
  assert.equal(readFileSync(join(home, '.listen', LOCK_NAME), 'utf8').trim(), '333')
  releaseLock(home, 333)
  assert.equal(lockState(home, { isDaemon: live }).state, 'free')
})

test('a pid is a daemon only when it is alive and its command line names the daemon', () => {
  assert.equal(isDaemonPid(process.pid, () => 'node /x/susy-daemon.mjs loop'), true)
  assert.equal(isDaemonPid(process.pid, () => 'node /x/other.mjs'), false)
  assert.equal(isDaemonPid(999999999, () => 'node /x/susy-daemon.mjs loop'), false, 'a dead pid is not a daemon')
})
