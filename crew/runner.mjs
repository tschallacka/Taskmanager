#!/usr/bin/env node
// The crew runner: starts a worker of the crew on its own model and lets it read its card. A runner
// worker is a person whose entry in crew.json `runners` names a runner and a provider, e.g.
//   "runners": { "wes": "opencode/ollama" }
// and whose model is pinned in runner-models.json (step 1). The rules are in runner-core.mjs.
//
//   runner once [--dry-run] [--cards <file.json>]   one pass: plan, then run what the plan starts
//   runner status                                    the state of each runner worker
//
// --dry-run prints the plan and starts nothing. --cards reads the cards from a file instead of the
// board ({ "<key>": [ card, ... ] }), so a pass can be rehearsed without a board. A runner never posts
// on the board in a dry run.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { here, loadCreds } from './config.mjs'
import { DEFAULTS, formatPlan, planPass, RUNNER_LABEL } from './runner-core.mjs'
import * as opencode from './runner-opencode.mjs'

const kit = fileURLToPath(new URL('.', import.meta.url))
const ADAPTERS = { opencode }

function runnerEntries() {
  const raw = JSON.parse(readFileSync(`${here}crew.json`, 'utf8'))
  return Object.entries(raw.runners ?? {}).map(([key, value]) => {
    const [runner, provider] = String(value).split('/')
    return { key, runner, provider }
  })
}

// The model pinned for a runner and provider in the kit's runner-models.json; null when not chosen.
function pinnedModel(runner, provider) {
  const pinned = JSON.parse(readFileSync(join(kit, 'runner-models.json'), 'utf8'))
  return pinned[runner]?.[provider]?.model ?? null
}

function workers() {
  return runnerEntries().map(entry => ({ ...entry, model: pinnedModel(entry.runner, entry.provider) }))
}

// The per-worker state: how often a worker ran on each card, and when, under CREW_HOME/runners/state.
function stateDir() {
  return join(here, 'runners', 'state')
}

function readStates(keys) {
  const states = {}
  for (const key of keys) {
    const file = join(stateDir(), `${key}.json`)
    states[key] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  }
  return states
}

function writeState(key, states) {
  mkdirSync(stateDir(), { recursive: true })
  writeFileSync(join(stateDir(), `${key}.json`), JSON.stringify(states[key], null, 2) + '\n', { mode: 0o600 })
}

// The cards a worker is on, read with its own key: my_tasks gives the ids, get_task the column and labels.
async function cardsOf(worker, creds) {
  const person = creds.people[worker.key]
  if (!person?.apiKey) throw new Error(`no key for ${worker.key} in creds.json`)
  const call = async (name, args) => {
    const res = await fetch(`${creds.base}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream', 'authorization': `Bearer ${person.apiKey}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
    })
    const body = await res.json()
    return JSON.parse(body.result?.content?.[0]?.text ?? 'null')
  }
  const mine = await call('my_tasks', {})
  const cards = []
  for (const task of mine?.tasks ?? []) {
    if (task.board?.id !== creds.board.id) continue
    const full = await call('get_task', { id: task.id })
    cards.push({ id: full.id, title: full.title, column: full.column, labels: full.labels ?? [], completed: Boolean(full.completed), updatedAt: full.updatedAt })
  }
  return cards
}

function message(card) {
  return `Work on the Taskmanager card ${card.id} "${card.title}". Read it with get_task, then do what it asks, in your own branch.`
}

// Runs one worker on one card, to the end of the process. Resolves with the session id, if one was printed.
function runOnce(worker, card) {
  const adapter = ADAPTERS[worker.runner]
  const workDir = join(here, 'runners', worker.key, 'work')
  mkdirSync(workDir, { recursive: true })
  const argv = adapter.args({ model: worker.model, message: message(card) })
  return new Promise((resolve, reject) => {
    const child = spawn(worker.runner, argv, { cwd: workDir, env: { ...process.env, ...adapter.env({}) }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    child.stderr.on('data', (chunk) => {
      out += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`${worker.runner} exited ${code}`))
      else resolve(adapter.parseSession(out))
    })
  })
}

// Posts the one QUESTION to Pia, from the worker's own key, on the card it could not finish.
async function postAsk(worker, card, creds) {
  const person = creds.people[worker.key]
  const body = `QUESTION: @pia the runner has used its ${DEFAULTS.maxRuns} runs on this card without it moving on. Which way should ${worker.key} go next? The runner stops here until a new update.`
  await fetch(`${creds.base}/api/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream', 'authorization': `Bearer ${person.apiKey}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'post_task_update', arguments: { id: card.id, body } } })
  })
}

async function once(argv) {
  const dryRun = argv.includes('--dry-run')
  const cardsFile = argv.includes('--cards') ? argv[argv.indexOf('--cards') + 1] : null
  const creds = cardsFile ? null : loadCreds()
  const list = workers()
  const cards = {}
  for (const worker of list) {
    cards[worker.key] = cardsFile ? JSON.parse(readFileSync(cardsFile, 'utf8'))[worker.key] ?? [] : await cardsOf(worker, creds)
  }
  const states = readStates(list.map(w => w.key))
  const plan = planPass({ workers: list, cards, states, now: Date.now() })
  for (const line of formatPlan(plan)) console.log(line)
  if (dryRun) return
  // A card that used its runs is not run again: the worker asks Pia once, and the runner stops there.
  for (const item of plan.filter(p => p.action === 'ask')) {
    const creds2 = creds ?? loadCreds()
    await postAsk(list.find(w => w.key === item.key), item.card, creds2)
    states[item.key][item.card.id] = { ...states[item.key][item.card.id], asked: true }
    writeState(item.key, states)
    console.log(`asked for ${item.key} on ${item.card.id}`)
  }
  for (const item of plan.filter(p => p.action === 'start')) {
    const worker = list.find(w => w.key === item.key)
    const session = await runOnce(worker, item.card)
    const state = states[item.key][item.card.id] ?? { runs: 0 }
    states[item.key][item.card.id] = { ...state, runs: state.runs + 1, lastRunAt: Date.now(), lastSeenUpdate: item.card.updatedAt, session }
    writeState(item.key, states)
    console.log(`ran ${item.key} on ${item.card.id}${session ? ` (session ${session})` : ''}`)
  }
}

function status() {
  const list = workers()
  const states = readStates(list.map(w => w.key))
  for (const worker of list) {
    const runs = Object.entries(states[worker.key]).map(([id, s]) => `${id}: ${s.runs} run(s)`)
    console.log(`${worker.key} ${worker.runner}/${worker.provider} ${worker.model ?? '(no model pinned)'}${runs.length ? ` | ${runs.join(', ')}` : ''}`)
  }
  if (!list.length) console.log(`no runner workers: add "runners" to crew.json (label ${RUNNER_LABEL})`)
}

const [command, ...rest] = process.argv.slice(2)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (command === 'once') await once(rest)
  else if (command === 'status') status()
  else {
    console.error('usage: runner once [--dry-run] [--cards <file.json>] | runner status')
    process.exit(64)
  }
}
