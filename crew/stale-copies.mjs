#!/usr/bin/env node
// `crew stale-copies`: a read-only report of the dev copies that should probably be stopped: a copy older than 4 hours,
// or a copy of a card that is Done. It lists each with its port, worktree, card and reason. It never stops anything: Janet
// stops a copy only with Boss's go. Read-only entries (Boss's dev copy and the testers' copies) are never listed.
//
// The reader is crew.json "reader", as for `crew dev-copies`. The reads are one get_task per live copy's card, for its
// column. There is no page limit to hit: a copy is checked by its own card, not by scanning the whole Done column (which
// holds more cards than one get_board answer may show). A card that cannot be read fails the run with its id.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boardCall } from './board-call.mjs'
import { readerOf } from './dev-copies.mjs'
import { aliveProcess, readRegistry, registryFile } from './port-registry.mjs'

export const MAX_AGE_MS = 4 * 60 * 60 * 1000
export const DONE_COLUMN = /^Done$/i

/** The card ids of the live copies: a copy is an entry that is not a reservation, not read-only, and whose process runs. */
export function copyTasks(reg, alive) {
  const ids = new Set()
  for (const entry of Object.values(reg?.ports ?? {})) {
    if (!entry || entry.readonly || entry.pid == null || !alive(entry.pid)) continue
    if (entry.task) ids.add(entry.task)
  }
  return [...ids]
}

/** The ids of the cards whose column is Done, from one get_task answer per card: [{ id, column }]. */
export function doneIdsOf(answers) {
  return new Set(answers.filter(a => DONE_COLUMN.test(String(a?.column ?? ''))).map(a => a.id))
}

/**
 * The copies to report, from the registry: a copy (not a reservation, not read-only) whose process runs, and that is older
 * than MAX_AGE_MS or whose card is in doneIds. `alive` and `now` are injected so the tests need no process and no clock.
 */
export function staleCopies(reg, { now, alive, doneIds }) {
  const out = []
  for (const [port, entry] of Object.entries(reg?.ports ?? {})) {
    if (!entry || entry.readonly || entry.pid == null || !alive(entry.pid)) continue
    const started = Date.parse(entry.started ?? '')
    const reasons = []
    if (Number.isFinite(started) && now - started > MAX_AGE_MS) {
      reasons.push(`older than 4 hours (${Math.floor((now - started) / 3600000)} h)`)
    }
    if (entry.task && doneIds.has(entry.task)) reasons.push('its card is Done')
    if (reasons.length) {
      out.push({ port: Number(port), who: entry.who ?? null, worktree: entry.worktree, branch: entry.branch ?? null, task: entry.task ?? null, pid: entry.pid, reason: reasons.join(' and ') })
    }
  }
  return out.sort((a, b) => a.port - b.port)
}

/** The report lines: one per copy, then the rule for stopping. */
export function staleLines(list) {
  if (!list.length) return ['stale dev copies: none']
  const lines = list.map(c => `:${c.port} ${c.who ?? '?'} ${c.worktree} card ${c.task ?? '?'} (pid ${c.pid}): ${c.reason}`)
  lines.push('read only: Janet stops a copy only with a go from Boss')
  return lines
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const crewHome = process.env.CREW_HOME
  if (!crewHome) {
    console.error('crew stale-copies: CREW_HOME is not set')
    process.exit(2)
  }
  const kit = dirname(fileURLToPath(import.meta.url))
  const readJson = path => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {})
  const reg = readRegistry(registryFile(crewHome))
  const ids = copyTasks(reg, aliveProcess)
  const answers = []
  try {
    const reader = readerOf(readJson(join(crewHome, 'crew.json')))
    for (const id of ids) {
      const task = boardCall(reader, 'get_task', { id }, kit)
      // A card with no column is an answer we cannot read: it must not pass as "not Done".
      if (!task?.column) throw new Error(`no column in the answer for card ${id}`)
      answers.push({ id, column: task.column })
    }
  } catch (error) {
    console.error(`crew stale-copies: ${error.message}`)
    process.exit(1)
  }
  const doneIds = doneIdsOf(answers)
  for (const line of staleLines(staleCopies(reg, { now: Date.now(), alive: aliveProcess, doneIds }))) console.log(line)
  process.exit(0)
}
