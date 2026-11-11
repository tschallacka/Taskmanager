#!/usr/bin/env node
// `crew restart-brief`: after `crew up`, the brief Pia uses to start each person fresh. For every crew member who holds
// open cards, one block: the card, its column, and the text of its last update. Read only: it calls the board's agent
// tools as each person (tm.mjs), and changes nothing. Pia does the starting; this only says what each one picks up.
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PEOPLE = ['wren', 'wick', 'wynn', 'wade', 'usher', 'nina', 'quincy', 'pat', 'tess', 'rita', 'janet']
const OPEN = /^(To do|In progress|Verify|Blocked)/i

// The list of cards a person holds, from `my_tasks`. Tolerates the two shapes the tool has returned.
export function cardsOf(myTasks) {
  const list = Array.isArray(myTasks) ? myTasks : (myTasks?.tasks ?? [])
  return list.filter(t => t && t.id).map(t => ({ id: t.id, title: t.title ?? '' }))
}

// One card's column and last update, from `get_task` with the newest update only.
export function lastUpdateOf(task) {
  const column = task?.column ?? '?'
  const updates = Array.isArray(task?.updates) ? task.updates : []
  const newest = updates[0] ?? null
  const body = (newest?.body ?? '').trim().replace(/\s+/g, ' ').slice(0, 300)
  return { column, body: body || '(no update yet)' }
}

// The brief for one person: the open cards, each with column and last update. `runner(who, tool, args)` returns the
// parsed JSON of the tool call (injected in tests).
export function briefFor(who, runner) {
  const cards = cardsOf(runner(who, 'my_tasks', {}))
  const blocks = []
  for (const card of cards) {
    const task = runner(who, 'get_task', { id: card.id, limit: 1 })
    const { column, body } = lastUpdateOf(task)
    if (!OPEN.test(column)) continue
    blocks.push({ id: card.id, title: card.title, column, body })
  }
  return blocks
}

export function restartBrief(people, runner) {
  const out = []
  for (const who of people) {
    const blocks = briefFor(who, runner)
    if (blocks.length) out.push({ who, blocks })
  }
  return out
}

function realRunner(kit) {
  return (who, tool, args) => {
    const run = spawnSync(process.execPath, [join(kit, 'tm.mjs'), who, 'mcp', tool, JSON.stringify(args)], { encoding: 'utf8', timeout: 120000 })
    if (run.status !== 0) return null
    try { return JSON.parse(run.stdout) } catch { return null }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const kit = dirname(fileURLToPath(import.meta.url))
  const plan = restartBrief(PEOPLE, realRunner(kit))
  if (!plan.length) console.log('restart brief: no open cards for the standing crew')
  for (const person of plan) {
    console.log(`${person.who}:`)
    for (const b of person.blocks) console.log(`  ${b.id} [${b.column}] ${b.title}\n    last: ${b.body}`)
  }
}
