// Susy's own detection (card mwnzgxz5uschuba1y7): the six problems the daemon finds without a model, from fake `claude
// agents` output, fake job states, fake cards and fake session records. Fake clock, no network, no mail.
// Run: node --test crew/susy-detect.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectProblems, dueMails, pruneMailed, lastBashCommand, isStopped, setStopped, stopMarkerPath, MIN, REPEAT_MINUTES, STARTUP_MINUTES, HUNG_MINUTES, GATE_MINUTES } from './susy-detect.mjs'

const NOW = Date.parse('2026-11-19T20:30:00.000Z')
const ago = minutes => new Date(NOW - minutes * MIN).toISOString()
const keyOf = name => ({ 'Wade Worker': 'wade', 'Nina Nitpick': 'nina', 'Usher Xander': 'usher' })[name] ?? null
const session = (name, sessionId, id = sessionId) => ({ id, sessionId, name, kind: 'background', status: 'idle' })
const job = (sessionId, fields) => [sessionId, { updatedAt: ago(1), tokens: 5000, tempo: 'active', detail: 'working', ...fields }]
const card = (id, column, fields = {}) => ({ id, title: `card ${id}`, column, assignee: null, blocked: false, updatedAt: ago(1), updates: [], ...fields })
const kinds = problems => problems.map(p => p.kind)

test('a session blocked by an API error: who, since when, the error, and that a restart is the fix', () => {
  const problems = detectProblems({
    now: NOW,
    sessions: [session('taskmanager-maintenance-nina', 'n1')],
    jobs: new Map([job('n1', { tempo: 'blocked', detail: 'API Error: Connection lost mid-response', updatedAt: ago(12) })])
  })
  assert.deepEqual(kinds(problems), ['blocked'])
  const [p] = problems
  assert.equal(p.who, 'taskmanager-maintenance-nina')
  assert.equal(p.age, 12)
  assert.equal(p.since, ago(12))
  assert.match(p.text, /^susy: /)
  assert.match(p.text, /taskmanager-maintenance-nina/)
  assert.match(p.text, /API Error: Connection lost mid-response/)
  assert.match(p.text, /12 min/)
  assert.match(p.text, /restart/)
})

test('a session whose detail is an API error is blocked even when its tempo is not', () => {
  const problems = detectProblems({
    now: NOW,
    sessions: [session('taskmanager-maintenance-wade', 'w1')],
    jobs: new Map([job('w1', { tempo: 'idle', detail: 'API Error: 403 Attention Required', updatedAt: ago(3) })])
  })
  assert.deepEqual(kinds(problems), ['blocked'])
})

test('a session that never took its first turn, or sits on a startup dialog for 5 minutes or more', () => {
  const dialog = detectProblems({
    now: NOW,
    sessions: [session('taskmanager-maintenance-usher', 'u1')],
    jobs: new Map([job('u1', { tempo: 'idle', detail: 'Stuck on the resume picker', tokens: 0, updatedAt: ago(7) })])
  })
  assert.deepEqual(kinds(dialog), ['startup'])
  const prompt = detectProblems({
    now: NOW,
    sessions: [session('taskmanager-maintenance-usher', 'u1')],
    jobs: new Map([job('u1', { tempo: 'idle', detail: 'idle: send a prompt to start', tokens: 0, updatedAt: ago(6) })])
  })
  assert.deepEqual(kinds(prompt), ['startup'])
  assert.equal(STARTUP_MINUTES, 5)
})

test('a startup problem under 5 minutes is not yet a problem', () => {
  const problems = detectProblems({
    now: NOW,
    sessions: [session('taskmanager-maintenance-usher', 'u1')],
    jobs: new Map([job('u1', { tempo: 'idle', detail: 'idle: send a prompt to start', tokens: 0, updatedAt: ago(3) })])
  })
  assert.deepEqual(kinds(problems), [])
})

test('a command hung 15 minutes or more: the command and its age are named', () => {
  const linkScanPath = join(mkdtempSync(join(tmpdir(), 'susy-detect-')), 'usher.jsonl')
  writeFileSync(linkScanPath, [
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls /tmp' } }] } }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'find /srv/agents -name "*.json" | head' } }] } })
  ].join('\n') + '\n')
  const problems = detectProblems({
    now: NOW,
    sessions: [session('taskmanager-maintenance-usher', 'u1')],
    jobs: new Map([job('u1', { detail: 'Running 2 shell commands . 19m', updatedAt: ago(0), linkScanPath })]),
    commandOf: state => lastBashCommand(state.linkScanPath)
  })
  assert.deepEqual(kinds(problems), ['hung'])
  assert.equal(problems[0].age, 19)
  assert.match(problems[0].text, /find \/srv\/agents -name/)
  assert.match(problems[0].text, /19 min/)
  assert.equal(HUNG_MINUTES, 15)
})

test('a command 14 minutes old is not yet a problem', () => {
  const problems = detectProblems({
    now: NOW,
    sessions: [session('taskmanager-maintenance-usher', 'u1')],
    jobs: new Map([job('u1', { detail: 'Running 1 shell commands . 14m', updatedAt: ago(0) })])
  })
  assert.deepEqual(kinds(problems), [])
})

test('a gate with ready work for 15 minutes and its owner idle for 15 minutes: nobody is on it', () => {
  const cards = [card('c1', 'Verify CQ', { updatedAt: ago(20) })]
  const problems = detectProblems({
    now: NOW,
    sessions: [session('taskmanager-maintenance-nina', 'n1')],
    jobs: new Map([job('n1', { tempo: 'idle', detail: 'listening', updatedAt: ago(16) })]),
    cards,
    keyOf
  })
  assert.deepEqual(kinds(problems), ['gate'])
  assert.equal(problems[0].cardId, 'c1')
  assert.equal(problems[0].who, 'nina')
  assert.match(problems[0].text, /Verify CQ/)
  assert.match(problems[0].text, /c1/)
  assert.equal(GATE_MINUTES, 15)
})

test('a gate whose owner has no live session is a gate problem too', () => {
  const problems = detectProblems({
    now: NOW,
    sessions: [session('taskmanager-maintenance-wade', 'w1')],
    jobs: new Map([job('w1', {})]),
    cards: [card('c2', 'Verify UX', { updatedAt: ago(40) })],
    keyOf
  })
  assert.deepEqual(kinds(problems), ['gate'])
  assert.equal(problems[0].who, 'usher')
})

test('a gate is not a problem while its owner works on it, or while the card is younger than 15 minutes', () => {
  const working = detectProblems({
    now: NOW,
    sessions: [session('taskmanager-maintenance-nina', 'n1')],
    jobs: new Map([job('n1', { tempo: 'active', detail: 'reviewing', updatedAt: ago(16) })]),
    cards: [card('c1', 'Verify CQ', { updatedAt: ago(20) })],
    keyOf
  })
  assert.deepEqual(kinds(working), [])
  const young = detectProblems({
    now: NOW,
    sessions: [session('taskmanager-maintenance-nina', 'n1')],
    jobs: new Map([job('n1', { tempo: 'idle', updatedAt: ago(16) })]),
    cards: [card('c1', 'Verify CQ', { updatedAt: ago(10) })],
    keyOf
  })
  assert.deepEqual(kinds(young), [])
})

test('a person with an In progress card and no live session: the card and the restart', () => {
  const problems = detectProblems({
    now: NOW,
    sessions: [session('taskmanager-maintenance-nina', 'n1')],
    jobs: new Map(),
    records: [{ key: 'wade', id: 'dead-session-id' }],
    cards: [card('c3', 'In progress', { assignee: 'Wade Worker' })],
    keyOf
  })
  assert.deepEqual(kinds(problems), ['gone'])
  assert.equal(problems[0].who, 'wade')
  assert.equal(problems[0].cardId, 'c3')
  assert.match(problems[0].text, /dead-session-id/)
})

test('a person whose recorded session is live, or who holds no card, is not reported as gone', () => {
  const live = detectProblems({
    now: NOW,
    sessions: [session('taskmanager-maintenance-wade', 'live-id')],
    jobs: new Map(),
    records: [{ key: 'wade', id: 'live-id' }],
    cards: [card('c3', 'In progress', { assignee: 'Wade Worker' })],
    keyOf
  })
  assert.deepEqual(kinds(live), [])
  const noCard = detectProblems({
    now: NOW,
    sessions: [],
    jobs: new Map(),
    records: [{ key: 'wade', id: 'gone-id' }],
    cards: [card('c4', 'To do', { assignee: 'Wade Worker' })],
    keyOf
  })
  assert.deepEqual(kinds(noCard), [])
})

test('a wake that failed three times in a row: the real tool error, not a cut sentence', () => {
  const problems = detectProblems({
    now: NOW,
    sessions: [],
    records: [{ key: 'wick', id: 'x', wake: { failures: 3, lastError: 'the screen shows a permission dialog: Allow this tool?' } }],
    cards: [card('c5', 'In progress', { assignee: 'Wick Worker' })],
    keyOf: () => 'wick'
  })
  assert.deepEqual(kinds(problems), ['wake'])
  assert.match(problems[0].text, /permission dialog: Allow this tool\?/)
  assert.equal(problems[0].cardId, 'c5')
})

test('two failed wakes are not yet a problem', () => {
  const problems = detectProblems({ now: NOW, sessions: [], records: [{ key: 'wick', id: 'x', wake: { failures: 2, lastError: 'paste failed' } }], cards: [], keyOf })
  assert.deepEqual(kinds(problems), [])
})

test('no session list (claude agents did not answer): the session checks say nothing, the wake check still runs', () => {
  const problems = detectProblems({
    now: NOW,
    sessions: null,
    jobs: new Map(),
    records: [{ key: 'wade', id: 'z' }, { key: 'wick', id: 'y', wake: { failures: 3, lastError: 'e' } }],
    cards: [card('c3', 'In progress', { assignee: 'Wade Worker' }), card('c6', 'Verify QA', { updatedAt: ago(60) })],
    keyOf
  })
  assert.deepEqual(kinds(problems), ['wake'])
})

test('mail: a problem is mailed once, again only after 30 minutes, and dropped when it clears', () => {
  assert.equal(REPEAT_MINUTES, 30)
  const p = { key: 'blocked|nina|x' }
  assert.deepEqual(dueMails({ problems: [p], mailed: {}, now: NOW }), [p])
  assert.deepEqual(dueMails({ problems: [p], mailed: { [p.key]: NOW - 10 * MIN }, now: NOW }), [])
  assert.deepEqual(dueMails({ problems: [p], mailed: { [p.key]: NOW - 30 * MIN }, now: NOW }), [p])
  assert.deepEqual(pruneMailed({ [p.key]: NOW, other: NOW }, [p]), { [p.key]: NOW })
  assert.deepEqual(pruneMailed({ [p.key]: NOW }, []), {})
})

test('a changed state is a new problem: the same card with another error is mailed again at once', () => {
  const first = { key: 'blocked|nina|API Error: 403' }
  const second = { key: 'blocked|nina|API Error: Connection lost' }
  assert.deepEqual(dueMails({ problems: [second], mailed: { [first.key]: NOW - MIN }, now: NOW }), [second])
})

test('the stop marker: stopped on purpose is a file in the crew home, set and cleared by the daemon', () => {
  const home = mkdtempSync(join(tmpdir(), 'susy-stop-'))
  assert.equal(isStopped(home), false)
  setStopped(home, true)
  assert.equal(isStopped(home), true)
  assert.match(stopMarkerPath(home), /susy-daemon\.stopped$/)
  setStopped(home, false)
  assert.equal(isStopped(home), false)
})
