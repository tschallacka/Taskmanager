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
import { cardFrom, DEFAULTS, formatPlan, planPass, repairUnread, RUNNER_LABEL } from './runner-core.mjs'
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

// One tools/call to the board with a worker's own key. A JSON-RPC error, a tool error and an answer with
// no text all throw, so a failed read is never taken for an empty board (the rule mentions.mjs keeps too).
async function callTool(creds, person, name, args) {
  if (!person?.apiKey) throw new Error(`no key for this worker in creds.json`)
  const res = await fetch(`${creds.base}/api/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream', 'authorization': `Bearer ${person.apiKey}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  })
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  const body = await res.json()
  if (body?.error) throw new Error(`${name}: ${body.error.message ?? 'JSON-RPC error'}`)
  const text = body?.result?.content?.[0]?.text
  if (body?.result?.isError) throw new Error(`${name}: ${text ?? 'failed'}`)
  if (typeof text !== 'string') throw new Error(`${name}: the answer has no content`)
  return JSON.parse(text)
}

// One card as the runner needs it, read with the worker's own key.
async function readCard(creds, person, id) {
  return cardFrom(await callTool(creds, person, 'get_task', { id }))
}

// The cards a worker is on, on this board: my_tasks gives the ids, get_task the column and labels.
async function readCards(worker, creds) {
  const person = creds.people[worker.key]
  const mine = await callTool(creds, person, 'my_tasks', {})
  const cards = []
  for (const task of mine?.tasks ?? []) {
    if (task.board?.id !== creds.board?.id) continue
    cards.push(await readCard(creds, person, task.id))
  }
  return cards
}

function message(card) {
  return `Work on the Taskmanager card ${card.id} "${card.title}". Read it with get_task, then do what it asks, in your own branch.`
}

// Runs one worker on one card, to the end of the process or the timeout, continuing `session` when there is one.
// Resolves with the session id the run printed (null if none); rejects when the run exits non-zero or runs past
// the timeout. CREW_RUN_TIMEOUT_MS overrides the timeout (a test uses it).
function runOnce(worker, card, session) {
  const adapter = ADAPTERS[worker.runner]
  const workDir = join(here, 'runners', worker.key, 'work')
  mkdirSync(workDir, { recursive: true })
  const argv = adapter.args({ model: worker.model, message: message(card), session })
  const timeoutMs = Number(process.env.CREW_RUN_TIMEOUT_MS) || DEFAULTS.runTimeoutMinutes * 60_000
  return new Promise((resolve, reject) => {
    const child = spawn(worker.runner, argv, { cwd: workDir, env: { ...process.env, ...adapter.env({}) }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${worker.runner} ran past ${timeoutMs} ms and was stopped`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    child.stderr.on('data', (chunk) => {
      out += chunk
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) reject(new Error(`${worker.runner} exited ${code}: ${out.trim().slice(-300)}`))
      else resolve(adapter.parseSession(out))
    })
  })
}

// Posts the one QUESTION to Pia, from the worker's own key, on the card it could not finish.
async function postAsk(worker, card, creds) {
  const body = `QUESTION: @pia the runner has used its ${DEFAULTS.maxRuns} runs on this card without it moving on. Which way should ${worker.key} go next? The runner stops here until a new update.`
  await callTool(creds, creds.people[worker.key], 'post_task_update', { id: card.id, body })
}

async function once(argv) {
  const dryRun = argv.includes('--dry-run')
  const cardsFile = argv.includes('--cards') ? argv[argv.indexOf('--cards') + 1] : null
  const creds = cardsFile ? null : loadCreds()
  const list = workers()
  const cards = {}
  for (const worker of list) {
    try {
      cards[worker.key] = cardsFile ? JSON.parse(readFileSync(cardsFile, 'utf8'))[worker.key] ?? [] : await readCards(worker, creds)
    } catch (err) {
      // A worker whose cards cannot be read gets no run this pass; the others still go.
      console.log(`could not read the cards of ${worker.key}: ${err.message}`)
      cards[worker.key] = []
    }
  }
  const states = readStates(list.map(w => w.key))
  const repaired = repairUnread(states, cards)
  if (!dryRun) for (const key of repaired) writeState(key, states)
  const plan = planPass({ workers: list, cards, states, now: Date.now() })
  for (const line of formatPlan(plan)) console.log(line)
  if (dryRun) return
  // A card that used its runs is not run again until Pia writes on it: the worker asks once, and waits.
  for (const item of plan.filter(p => p.action === 'ask')) {
    const worker = list.find(w => w.key === item.key)
    const prev = states[item.key][item.card.id] ?? { runs: 0 }
    const c = creds ?? loadCreds()
    try {
      await postAsk(worker, item.card, c)
    } catch (err) {
      console.log(`could not ask Pia for ${item.key} on ${item.card.id}: ${err.message}`)
      continue
    }
    // Written as soon as the question is on the card, so a later failure cannot post it twice. The baseline
    // is unknown until the card is read again: until then the state is unread and acts on nothing.
    states[item.key][item.card.id] = { ...prev, asked: true, lastSeenCount: null, unread: true }
    writeState(item.key, states)
    try {
      const after = await readCard(c, c.people[worker.key], item.card.id)
      states[item.key][item.card.id] = { ...states[item.key][item.card.id], lastSeenCount: after.updateCount, unread: false }
      writeState(item.key, states)
    } catch (err) {
      console.log(`could not re-read ${item.card.id}: ${err.message}; the baseline is set on the next pass`)
    }
    console.log(`asked for ${item.key} on ${item.card.id}`)
  }
  // A failed run is counted like any other run, so a card that always fails reaches maxRuns and is asked about.
  for (const item of plan.filter(p => p.action === 'start')) {
    const worker = list.find(w => w.key === item.key)
    const prev = states[item.key][item.card.id] ?? { runs: 0 }
    const started = Date.now()
    let session = null
    let error = null
    try {
      session = await runOnce(worker, item.card, prev.session ?? null)
    } catch (err) {
      error = err.message
    }
    // The card's update count after the run: the worker's own updates are then seen, not news for the next
    // pass. When that read fails, the baseline is unknown and the next pass sets it from its own read.
    let baseline = { lastSeenCount: item.card.updateCount ?? null, unread: false }
    if (creds) {
      try {
        baseline = { lastSeenCount: (await readCard(creds, creds.people[worker.key], item.card.id)).updateCount, unread: false }
      } catch (err) {
        baseline = { lastSeenCount: null, unread: true }
        console.log(`could not re-read ${item.card.id}: ${err.message}; the baseline is set on the next pass`)
      }
    }
    const runNo = prev.runs + 1
    states[item.key][item.card.id] = { runs: runNo, lastRunAt: started, ...baseline, asked: false, session, lastError: error }
    writeState(item.key, states)
    if (error) console.log(`failed ${item.key} on ${item.card.id} (run ${runNo}): ${error}`)
    else console.log(`ran ${item.key} on ${item.card.id} (run ${runNo})${session ? ` (session ${session})` : ''}`)
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
