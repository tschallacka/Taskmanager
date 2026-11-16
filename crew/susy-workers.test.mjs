// Susy's worker collector, with fixture transcripts (no Claude session, no board): the states come from the subagents'
// own transcripts, in Boss's names, and map onto the poke rules. Run:
//   node --test crew/susy-workers.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readWorkerRows, workerPeople, workerStates, projectsRoot } from './susy-workers.mjs'
import { piaProjectsDir } from './activity.mjs'
import { keyOfName } from './susy.mjs'
import { collectActivity } from './susy-collector.mjs'

const MIN = 60000
const NOW = Date.parse('2026-11-12T12:00:00.000Z')
const keyOf = keyOfName({})

// One subagent: its transcript (the given steps, one JSON line each) and its meta; `minutesAgo` sets the last write.
function agent(root, session, name, { agentType, steps, minutesAgo }) {
  const dir = join(root, session, 'subagents')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `agent-${name}.jsonl`)
  writeFileSync(file, steps.map(s => JSON.stringify(s)).join('\n') + '\n')
  writeFileSync(join(dir, `agent-${name}.meta.json`), JSON.stringify({ agentType: `taskmanager-maintenance-${agentType}`, description: `${agentType} task` }))
  const at = (NOW - minutesAgo * MIN) / 1000
  utimesSync(file, at, at)
}

const text = t => ({ message: { role: 'assistant', content: [{ type: 'text', text: t }] } })
const tool = (name, input) => ({ message: { role: 'assistant', content: [{ type: 'tool_use', name, input }] } })
const result = () => ({ message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } })

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'susy-workers-'))
  const session = 'session-1'
  agent(root, session, 'wick', { agentType: 'wick-worker', minutesAgo: 1, steps: [tool('Bash', { command: 'npm test' }), result()] })
  agent(root, session, 'wren', { agentType: 'wren-worker', minutesAgo: 2, steps: [text('Done; the card is ready.')] })
  agent(root, session, 'wade', { agentType: 'wade-worker', minutesAgo: 3, steps: [tool('SubagentHandback', { message: 'handing back' })] })
  agent(root, session, 'wynn', { agentType: 'wynn-worker', minutesAgo: 12, steps: [tool('Bash', { command: 'node /x/crew-kit/listen.mjs wynn 600' })] })
  return root
}

// The card a worker holds: In progress, assigned to the worker.
function card(id, assignee, extra = {}) {
  return { id, title: `Card ${id}`, column: 'In progress', assignee, blocked: false, updatedAt: NOW - 30 * MIN, updates: [], ...extra }
}

test('the states come from each transcript, in Boss\'s names; a worker with no transcript has no row', () => {
  const rows = readWorkerRows({ root: fixtureRoot(), now: NOW, cmdlines: [] })
  assert.equal(rows.get('wick').state, 'working')
  assert.equal(rows.get('wren').state, 'ended')
  assert.equal(rows.get('wade').state, 'handedback')
  assert.equal(rows.get('wynn').state, 'listening')
  assert.equal(rows.has('usher'), false, 'no transcript for usher: no row, no judgement')
})

test('ended or handed back with a card In progress is needs resume; listening or silent for 10 minutes with a card is idle; working is nothing', () => {
  const rows = readWorkerRows({ root: fixtureRoot(), now: NOW, cmdlines: [] })
  const cards = [card('c1', 'Wren Worker'), card('c2', 'Wade Worker'), card('c3', 'Wynn Worker'), card('c4', 'Wick Worker')]
  const people = Object.fromEntries(workerPeople({ rows, cards, keyOf, now: NOW }).map(p => [p.key, p]))
  assert.equal(people.wren.state, 'gone', 'ended with a card: needs resume')
  assert.equal(people.wade.state, 'gone', 'handed back with a card: needs resume')
  assert.equal(people.wynn.state, 'idle', 'listening for 12 minutes with a card: idle')
  assert.equal(people.wick.state, 'working', 'working: nothing to say')
})

test('a worker with no card In progress is never needs resume or idle', () => {
  const rows = readWorkerRows({ root: fixtureRoot(), now: NOW, cmdlines: [] })
  const people = Object.fromEntries(workerPeople({ rows, cards: [], keyOf, now: NOW }).map(p => [p.key, p]))
  assert.equal(people.wren.state, 'working')
  assert.equal(people.wynn.state, 'working')
  assert.equal(people.wade.state, 'working')
})

test('a WAITING marker on the card (younger than 45 minutes) holds the worker: no poke, no resume', () => {
  const rows = readWorkerRows({ root: fixtureRoot(), now: NOW, cmdlines: [] })
  const waiting = { body: `WAITING Pia's go since ${new Date(NOW - 10 * MIN).toISOString()}`, at: new Date(NOW - 10 * MIN).toISOString() }
  const people = Object.fromEntries(workerPeople({ rows, cards: [card('c3', 'Wynn Worker', { updates: [waiting] })], keyOf, now: NOW }).map(p => [p.key, p]))
  assert.equal(people.wynn.state, 'waiting')
})

test('the heartbeat carries Boss\'s names for each worker', () => {
  const rows = readWorkerRows({ root: fixtureRoot(), now: NOW, cmdlines: [] })
  const names = Object.fromEntries(workerStates({ rows }).map(w => [w.key, w.state]))
  assert.deepEqual(names, { wick: 'working', wren: 'ended', wynn: 'listening', wade: 'handedback' })
})

test('the folder: CREW_PROJECTS wins, then crew.json "activity", then the folder derived from the crew home', () => {
  assert.equal(projectsRoot({ crewHome: '/c/home', crew: { activity: { projects: '/from/crew' } }, env: { CREW_PROJECTS: '/from/env' } }), '/from/env')
  assert.equal(projectsRoot({ crewHome: '/c/home', crew: { activity: { projects: '/from/crew' } }, env: {} }), '/from/crew')
  assert.equal(projectsRoot({ crewHome: '/c/home', crew: {}, env: {} }), piaProjectsDir('/c/home'))
})

test('the collector turns the rows into the lines: needs resume to Pia, a poke for the idle worker, nothing for the rest', () => {
  const rows = readWorkerRows({ root: fixtureRoot(), now: NOW, cmdlines: [] })
  const cards = [card('c1', 'Wren Worker'), card('c2', 'Wade Worker'), card('c3', 'Wynn Worker'), card('c4', 'Wick Worker')]
  const out = collectActivity({ now: NOW, home: '/nowhere', cards, rows, load: 9, state: {}, keyOf, listenerRunning: true })
  assert.ok(out.lines.some(line => /^to pia: needs resume: wren has c1/.test(line)))
  assert.ok(out.lines.some(line => /^to pia: needs resume: wade has c2/.test(line)))
  assert.ok(out.lines.some(line => /^poke wynn on c3: idle 12 min/.test(line)))
  assert.equal(out.lines.some(line => /wick|c4/.test(line)), false, 'the working worker is not mentioned')
})
