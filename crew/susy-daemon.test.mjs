// crew susy-daemon: one tick with a fake board and a fake clock. Dry-run only: a tick reads and logs, it posts nothing.
// Run: node --test crew/susy-daemon.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tick, pendingKey, runOnce, statusLines } from './susy-daemon.mjs'

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
  const readCards = async () => { throw new Error('get_board answered HTTP 503') }
  const first = await tick({ now: T0, crew: CREW, readCards, state: {} })
  assert.equal(first.ok, false)
  assert.deepEqual(first.lines, [
    'susy-daemon: get_board answered HTTP 503',
    'would mail boss once: susy-daemon has no board answer: get_board answered HTTP 503'
  ])
  const second = await tick({ now: T0 + MIN, crew: CREW, readCards, state: first.state })
  assert.deepEqual(second.lines, ['susy-daemon: get_board answered HTTP 503'])
  assert.equal(second.state.errorStreak, 2)
})

test('a good tick after errors says the board is back, and a new error mails Boss again', async () => {
  let fail = true
  const readCards = async () => { if (fail) throw new Error('no account yet'); return [] }
  const bad = await tick({ now: T0, crew: CREW, readCards, state: {} })
  fail = false
  const good = await tick({ now: T0 + MIN, crew: CREW, readCards, state: bad.state })
  assert.equal(good.ok, true)
  assert.match(good.lines[0], /back to normal \(was: no account yet\)/)
  assert.equal(good.state.errorStreak, undefined)
  fail = true
  const again = await tick({ now: T0 + 2 * MIN, crew: CREW, readCards, state: good.state })
  assert.ok(again.lines.some(line => line.startsWith('would mail boss once')))
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
