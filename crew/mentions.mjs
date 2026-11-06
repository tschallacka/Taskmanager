#!/usr/bin/env node
// Boss's inbox for questions on the board. Pia and the crew write "@cato" (or "@boss") in a task update;
// Boss is not a board member, so no notification reaches the Owner's session. This finds those updates.
//   crew mentions                 one check: every mention since the last check (the first time, the last 24 hours)
//   crew mentions <minutes>       one check: every mention from the last <minutes>
//   crew mentions --follow        checks every 60 s and prints one line per new mention, until stopped;
//                                 run it as a Monitor in Boss's session, so each mention wakes Boss
// A mention is printed once: the ids already printed, the last check and each card's update count are kept
// in CREW_HOME/.listen/boss-mentions.json, so a one-shot check after --follow (or after a restart) prints only
// what is new. Boards: the crew's board and, for a fork, its main board and its crew board. Key:
// TASKMANAGER_API_KEY (the Owner's key, which Boss's session already has), else the crew's boss account.
// Only Pia talks to Boss: the workers and reviewers ask Pia, and Pia decides what goes to Boss. So only an update
// written by the PM counts; "@cato" from anyone else (a worker, a reviewer, Boss itself) is ignored.
// Limits: only top-level cards are read, so Pia asks Boss in an update on the main card, not on a subtask; and a
// column past 200 cards is read only up to 200, which the watch says once.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// "@cato" or "@boss" as a word of its own: not inside an address (x@cato.nl) or a longer name (@catoni).
export const MENTION = /(?<![\w.+-])@(cato|boss)(?![\w-]|\.\w)/i
// The PM's author name on the board: "fork taskmanager-pia (agent)" for a fork, "Pia Planner (agent)" for the crew's own.
export const PM_AUTHOR = /(^|[\s-])pia\b/i
const SEEN_KEEP = 500

/** The text of a tools/call answer, or an error: a JSON-RPC error and a tool error are never an empty board. */
export function rpcResult(name, body) {
  if (body?.error) throw new Error(`${name}: ${body.error.message ?? 'JSON-RPC error'}`)
  const text = body?.result?.content?.[0]?.text
  if (body?.result?.isError) throw new Error(`${name}: ${text ?? 'failed'}`)
  if (typeof text !== 'string') throw new Error(`${name}: the answer has no content`)
  return JSON.parse(text)
}

/** One line per update by the PM that mentions Boss and is not in `seen`. Does not change `seen`. */
export function mentionLines(task, updates, seen) {
  const found = []
  for (const update of updates ?? []) {
    if (!update?.id || seen.has(update.id) || !PM_AUTHOR.test(String(update.author)) || !MENTION.test(String(update.body))) continue
    const text = String(update.body).replace(/\s+/g, ' ').trim()
    found.push({ id: update.id, line: `@cato on ${task.id} "${task.title}" by ${update.author}: ${text.length > 240 ? `${text.slice(0, 240)}…` : text}` })
  }
  return found
}

/**
 * The watch itself, without the network: `call(name, args)` answers a tool call, `state` is
 * { since, counts, seen } and is changed only by a pass that completes, so a failed pass loses nothing.
 * Posting an update does not change a card's updatedAt, so a card is read again when its update count changed.
 */
export function createWatcher({ call, boards, state, now = () => new Date().toISOString(), note = () => {} }) {
  const open = new Set(boards)
  const warned = new Set()
  async function pass() {
    const started = now()
    const counts = {}
    const found = []
    // A saved `since` that is not a time (a hand-edited state file, say) starts from 24 hours back instead of failing every pass.
    const base = Date.parse(state.since)
    // Five seconds of overlap cover a clock that runs a little behind the board's; `seen` drops the repeats.
    const since = new Date((Number.isNaN(base) ? Date.parse(started) - 86400000 : base) - 5000).toISOString()
    for (const board of [...open]) {
      let data
      try {
        data = await call('get_board', { board, detail: 'titles', limit: 200 })
      } catch (error) {
        // A board this key cannot open (a crew's own unused board, say) is dropped once, with one line.
        if (!/No board/.test(error.message)) throw error
        open.delete(board)
        note(`crew mentions: board ${board} is not open to this key; no longer checked`)
        continue
      }
      for (const column of data?.columns ?? []) {
        // get_board reads at most 200 cards a column. Say so once, instead of skipping the rest without a word.
        const key = `${board}/${column.name}`
        if (Number(column.omitted) > 0 && !warned.has(key)) {
          warned.add(key)
          note(`crew mentions: column "${column.name}" on board ${board} has ${column.omitted} more cards than one read returns; @cato on those is not seen`)
        }
        for (const task of column.tasks ?? []) {
          const total = Number(task.updates ?? 0)
          counts[task.id] = total
          if (!total || state.counts[task.id] === total) continue
          // `since` returns every update after it, not only the newest five, so a burst of updates loses none.
          const full = await call('get_task', { id: task.id, since })
          const seen = new Set([...state.seen, ...found.map(f => f.id)])
          found.push(...mentionLines(task, full?.updates, seen))
        }
      }
    }
    state.since = started
    state.counts = counts
    state.seen = [...state.seen, ...found.map(f => f.id)].slice(-SEEN_KEEP)
    return found.map(f => f.line)
  }
  return { pass }
}

/**
 * Runs passes until `rounds` is used up. A failed pass prints one line, and one more when a pass works again,
 * so a failing board is not one line a minute and silence means quiet.
 */
export async function follow({ pass, print, wait, rounds = Infinity, save = () => {} }) {
  let failing = false
  for (let round = 0; round < rounds; round++) {
    try {
      const lines = await pass()
      save()
      if (lines.length) print(lines.join('\n'))
      if (failing) print('crew mentions: the board answers again')
      failing = false
    } catch (error) {
      if (!failing) print(`crew mentions: check failed (${error.message}); trying again every 60 s`)
      failing = true
    }
    if (round + 1 < rounds) await wait()
  }
}

async function main() {
  const { here, loadCreds, loadForks } = await import('./config.mjs')
  const creds = loadCreds()
  const key = process.env.TASKMANAGER_API_KEY || creds.people?.boss?.apiKey
  if (!key) {
    console.error('crew mentions: no key. Set TASKMANAGER_API_KEY, or give creds.json a boss account.')
    return 64
  }
  const boards = new Set([creds.board?.id])
  for (const { data } of loadForks()) {
    boards.add(data.board?.id)
    boards.add(data.shadowBoard?.id)
  }
  boards.delete(undefined)
  boards.delete(null)

  let id = 1
  const call = async (name, args) => {
    const res = await fetch(`${creds.base}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream', 'authorization': `Bearer ${key}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name, arguments: args } }),
      signal: AbortSignal.timeout(30000)
    })
    if (!res.ok) throw new Error(`${name} answered HTTP ${res.status}`)
    return rpcResult(name, await res.json())
  }

  mkdirSync(`${here}.listen`, { recursive: true })
  const statePath = `${here}.listen/boss-mentions.json`
  let saved = null
  try {
    saved = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null
  } catch {
    saved = null
  }
  const arg = process.argv[2]
  const minutes = arg && arg !== '--follow' ? Number(arg) : null
  if (minutes !== null && !(minutes > 0)) {
    console.error('usage: crew mentions [minutes | --follow]')
    return 64
  }
  const state = {
    since: minutes !== null || !saved?.since ? new Date(Date.now() - (minutes ?? (arg === '--follow' ? 0 : 1440)) * 60000).toISOString() : saved.since,
    // A look-back reads every card again; otherwise only the cards whose update count changed since the last check.
    counts: minutes !== null ? {} : (saved?.counts ?? {}),
    seen: saved?.seen ?? []
  }
  const save = () => writeFileSync(statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 })
  const watcher = createWatcher({ call, boards: [...boards], state, note: line => console.log(line) })

  if (arg !== '--follow') {
    const lines = await watcher.pass()
    save()
    console.log(lines.length ? lines.join('\n') : 'no new @cato mention')
    return 0
  }
  await follow({ pass: watcher.pass, save, print: text => console.log(text), wait: () => new Promise(resolve => setTimeout(resolve, 60000)) })
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then((code) => {
    process.exitCode = code
  }, (error) => {
    console.log(`crew mentions: ${error.message}`)
    process.exitCode = 1
  })
}
