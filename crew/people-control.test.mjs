// `crew up|restart|stop [person]` (people-control.mjs) with fakes: no real claude, no real typing. Run:
//   node --test crew/people-control.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseControl, controlPeople, CONTROL_COMMANDS } from './people-control.mjs'

const LIVE = 'bb000002'
const DEAD = 'aa000001'

function homeWith(records) {
  const home = mkdtempSync(join(tmpdir(), 'people-control-home-'))
  mkdirSync(join(home, 'sessions'), { recursive: true })
  for (const [key, rec] of Object.entries(records)) writeFileSync(join(home, 'sessions', `${key}.json`), JSON.stringify(rec))
  return home
}

// Fake dependencies: `live` is the set of ids claude agents lists as running; every call is logged in order.
function fakeDeps({ live = [], refuseResume = false, startFails = false, wakeFails = false } = {}) {
  const log = []
  const running = new Set(live)
  return {
    log,
    listAgents: () => [...running].map(id => ({ id, name: '', state: 'idle', status: 'running', startedAt: 0 })),
    start: ({ key, resumeOnly }) => {
      log.push(['start', key, resumeOnly === true])
      if (startFails) return { ok: false, reason: 'claude did not start the session: boom' }
      if (refuseResume) return { ok: false, reason: 'resume of bb000002 failed: no such session; not started fresh' }
      running.add(LIVE)
      return { ok: true, id: LIVE, started: true, resumed: true }
    },
    stop: ({ key }) => {
      log.push(['stop', key])
      running.clear()
      return { ok: true }
    },
    wake: ({ key }) => {
      log.push(['wake', key])
      return wakeFails ? { ok: false, reason: 'not idle' } : { ok: true }
    },
    resolveRole: () => ({ role: 'the role' })
  }
}

test('parseControl reads the command and an optional person key, and refuses anything else', () => {
  assert.deepEqual(CONTROL_COMMANDS, ['up', 'restart', 'stop'])
  assert.deepEqual(parseControl(['up']), { command: 'up', person: null })
  assert.deepEqual(parseControl(['restart', 'pia']), { command: 'restart', person: 'pia' })
  assert.deepEqual(parseControl(['stop', 'wren']), { command: 'stop', person: 'wren' })
  assert.match(parseControl(['frob']).error, /usage/)
  assert.match(parseControl([]).error, /usage/)
  assert.match(parseControl(['stop', 'Bad Key!']).error, /no such person key/)
  assert.match(parseControl(['up', 'a', 'b']).error, /usage/)
})

test('stop of a running person stops the recorded session and says so, one line', async () => {
  const home = homeWith({ wren: { id: LIVE, name: 'wren', folder: '/tmp' } })
  const deps = fakeDeps({ live: [LIVE] })
  const out = await controlPeople('stop', 'wren', { home, deps })
  assert.deepEqual(out.lines, [`wren: stopped ${LIVE}`])
  assert.equal(out.ok, true)
  assert.deepEqual(deps.log, [['stop', 'wren']])
})

test('stop of a person who is not running changes nothing', async () => {
  const home = homeWith({ wren: { id: DEAD, name: 'wren', folder: '/tmp' } })
  const deps = fakeDeps({ live: [] })
  const out = await controlPeople('stop', 'wren', { home, deps })
  assert.deepEqual(out.lines, ['wren: not running'])
  assert.equal(out.ok, true)
  assert.deepEqual(deps.log, [])
})

test('restart stops the live session, resumes it with resumeOnly, and wakes it once', async () => {
  const home = homeWith({ wick: { id: LIVE, name: 'wick', folder: '/tmp' } })
  const deps = fakeDeps({ live: [LIVE] })
  const out = await controlPeople('restart', 'wick', { home, deps })
  assert.equal(out.ok, true)
  assert.deepEqual(deps.log, [['stop', 'wick'], ['start', 'wick', true], ['wake', 'wick']])
  assert.equal(out.lines.length, 1)
  assert.match(out.lines[0], /^wick: restarted \(bb000002\), woke once$/)
})

test('restart refuses loudly when the resume fails, and never starts fresh', async () => {
  const home = homeWith({ wick: { id: DEAD, name: 'wick', folder: '/tmp' } })
  const deps = fakeDeps({ live: [], refuseResume: true })
  const out = await controlPeople('restart', 'wick', { home, deps })
  assert.equal(out.ok, false)
  assert.match(out.lines[0], /^wick: failed: resume of bb000002 failed: .*not started fresh$/)
  assert.equal(deps.log.filter(c => c[0] === 'start').every(c => c[2] === true), true, 'every start is resume-only')
  assert.equal(deps.log.some(c => c[0] === 'wake'), false, 'no wake for a session that did not start')
})

test('a start that claude refuses is reported as failed, and nothing is woken', async () => {
  const home = homeWith({ wick: { id: DEAD, name: 'wick', folder: '/tmp' } })
  const deps = fakeDeps({ live: [], startFails: true })
  const out = await controlPeople('up', 'wick', { home, deps })
  assert.equal(out.ok, false)
  assert.deepEqual(out.lines, ['wick: failed: claude did not start the session: boom'])
  assert.equal(deps.log.some(c => c[0] === 'wake'), false)
})

test('a wake that cannot be sent is reported on the line, and the session stays started', async () => {
  const home = homeWith({ wade: { id: DEAD, name: 'wade', folder: '/tmp' } })
  const deps = fakeDeps({ live: [], wakeFails: true })
  const out = await controlPeople('up', 'wade', { home, deps })
  assert.equal(out.ok, false)
  assert.match(out.lines[0], /^wade: started \(bb000002\), wake not sent: not idle$/)
})

test('up of a person whose session is running reports it and starts nothing', async () => {
  const home = homeWith({ wynn: { id: LIVE, name: 'wynn', folder: '/tmp' } })
  const deps = fakeDeps({ live: [LIVE] })
  const out = await controlPeople('up', 'wynn', { home, deps })
  assert.deepEqual(out.lines, [`wynn: already running (${LIVE})`])
  assert.equal(out.ok, true)
  assert.deepEqual(deps.log, [])
})

test('up of a stopped person resumes it once and wakes it', async () => {
  const home = homeWith({ wade: { id: DEAD, name: 'wade', folder: '/tmp' } })
  const deps = fakeDeps({ live: [] })
  const out = await controlPeople('up', 'wade', { home, deps })
  assert.equal(out.ok, true)
  assert.deepEqual(deps.log, [['start', 'wade', true], ['wake', 'wade']])
  assert.match(out.lines[0], /^wade: started \(bb000002\), woke once$/)
})

test('up with no person handles every recorded person, in key order', async () => {
  const home = homeWith({ wren: { id: LIVE, name: 'wren', folder: '/tmp' }, wick: { id: DEAD, name: 'wick', folder: '/tmp' } })
  const deps = withPia(fakeDeps({ live: [LIVE] }), { ok: true, lines: ['pia: already running'] })
  const out = await controlPeople('up', null, { home, deps })
  assert.equal(out.lines.length, 3)
  assert.equal(out.lines[0], 'pia: already running')
  assert.match(out.lines[1], /^wick: started/)
  assert.match(out.lines[2], /^wren: already running/)
})

test('a person with no recorded session is reported as failed, never started with a guessed id', async () => {
  const home = homeWith({})
  const deps = fakeDeps()
  const out = await controlPeople('restart', 'nina', { home, deps })
  assert.equal(out.ok, false)
  assert.match(out.lines[0], /^nina: failed: no recorded session/)
  assert.deepEqual(deps.log, [])
})

// Pia has her own terminal (pia-tmux.mjs, card mwmzv2jt): her control goes through deps.pia, never through a recorded session.
function withPia(deps, result) {
  deps.pia = async (command) => {
    deps.log.push(['pia', command])
    return typeof result === 'function' ? result(command) : result
  }
  return deps
}

test('pia goes to her own terminal control: crew restart pia runs the pia control and touches no worker', async () => {
  const home = homeWith({ wren: { id: LIVE, name: 'wren', folder: '/tmp' } })
  const deps = withPia(fakeDeps({ live: [LIVE] }), { ok: true, lines: ['pia: restart done'] })
  const out = await controlPeople('restart', 'pia', { home, deps })
  assert.equal(out.ok, true)
  assert.deepEqual(out.lines, ['pia: restart done'])
  assert.deepEqual(deps.log, [['pia', 'restart']])
})

test('a failing pia control makes the whole command fail, with her lines as they are', async () => {
  const home = homeWith({})
  const deps = withPia(fakeDeps(), { ok: false, lines: ['pia: resume of aa11bb22 failed: boom; not started fresh'] })
  const out = await controlPeople('up', 'pia', { home, deps })
  assert.equal(out.ok, false)
  assert.deepEqual(out.lines, ['pia: resume of aa11bb22 failed: boom; not started fresh'])
})

test('crew up with no person brings Pia up first, then the recorded persons', async () => {
  const home = homeWith({ wren: { id: LIVE, name: 'wren', folder: '/tmp' } })
  const deps = withPia(fakeDeps({ live: [] }), { ok: true, lines: ['pia: already running'] })
  const out = await controlPeople('up', null, { home, deps })
  assert.equal(out.ok, true)
  assert.deepEqual(deps.log[0], ['pia', 'up'])
  assert.ok(out.lines.includes('pia: already running'))
})
