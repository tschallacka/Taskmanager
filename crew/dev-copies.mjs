#!/usr/bin/env node
// `crew dev-copies`: after `crew up`, checks the copy of each card that waits in Verify UX or Verify QA. Each worker's
// dev copy is served on the port devserver-worker.sh gives that worker (wren 3101, wick 3102, wynn 3103, wade 3104).
// For each such card the check prints the owner, the card, the branch linked to the card, the port, and whether a copy
// answers there. A card with no copy answering gets one more line: `no copy: ask Boss: tester-copy.sh start <owner> <branch>`.
// It never starts anything: Boss starts the copy. Read only.
//
// The read is one get_board call on the crew's board, for the two gate columns only, at most 200 cards per column (the
// board's ceiling per column: get_board has no cursor). Then one get_task per gate card for its branch. A gate column
// over the ceiling is printed as cut with the ceiling, its cards past it are not checked, and the command exits 1.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boardCall } from './board-call.mjs'
import { keyOfName } from './susy.mjs'

export const UX_OR_QA_COLUMN = /^Verify (UX|QA)/i
// The member whose board read this is: a reader, not a worker, so Pia's key.
export const READER = 'pia'
// The board's ceiling of cards per column in one get_board answer.
export const CEILING = 200
export const GATE_COLUMNS = ['Verify UX', 'Verify QA']

// The port devserver-worker.sh serves each worker's copy on. devserver-worker.sh's own case table is the source: if a
// port moves there, change it here in the same commit (and in the test that pins these values).
export const PORTS = { wren: 3101, wick: 3102, wynn: 3103, wade: 3104 }

/**
 * The gate cards from one get_board answer, each with its owner's key (or the display name when no key matches), and
 * the gate columns that were cut at the page size. A column whose taskCount is above the tasks it shows is cut.
 */
export function gateCards(board, keyOf) {
  const cards = []
  const cut = []
  for (const column of board?.columns ?? []) {
    if (!UX_OR_QA_COLUMN.test(column.name)) continue
    const shown = (column.tasks ?? []).length
    const total = Number(column.taskCount ?? shown)
    if (total > shown) cut.push({ column: column.name, shown, total })
    for (const task of column.tasks ?? []) {
      cards.push({ who: keyOf(task.assignee) ?? task.assignee ?? null, id: task.id, title: task.title, column: column.name })
    }
  }
  return { cards, cut }
}

// The branch a card's linked GitHub items name, or null when none does.
export function branchOf(task) {
  for (const item of task?.github ?? []) {
    const branch = item?.branch ?? item?.headRef ?? item?.head_ref ?? item?.pullRequest?.branch
    if (typeof branch === 'string' && branch) return branch
  }
  return null
}

// The lines for the cards, and whether every card has a copy up. `probe(port)` says whether a copy answers there.
export function copyLines(cards, { ports = PORTS, probe, branches = {} }) {
  const lines = []
  let ok = true
  for (const card of cards) {
    const port = ports[card.who]
    const branch = branches[card.id] ?? null
    const head = `${card.who}: card ${card.id} [${card.column}]`
    if (!port) {
      ok = false
      lines.push(`${head}: no port for ${card.who}, cannot check its copy`)
      continue
    }
    if (!branch) {
      ok = false
      lines.push(`${head}: no branch linked to the card, cannot check its copy on :${port}`)
      continue
    }
    if (probe(port)) {
      lines.push(`${head} branch ${branch} on :${port}: up`)
    } else {
      ok = false
      lines.push(`${head} branch ${branch} on :${port}: not up`)
      lines.push(`no copy: ask Boss: tester-copy.sh start ${card.who} ${branch}`)
    }
  }
  return { lines, ok }
}

export function probeHttp(port) {
  const run = spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '5', `http://localhost:${port}/`], { encoding: 'utf8' })
  return run.status === 0 && /^[23]\d\d$/.test(run.stdout.trim())
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const crewHome = process.env.CREW_HOME
  if (!crewHome) {
    console.error('crew dev-copies: CREW_HOME is not set')
    process.exit(2)
  }
  const kit = dirname(fileURLToPath(import.meta.url))
  const readJson = path => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {})
  const runner = (tool, args) => boardCall(READER, tool, args, kit)
  let cards
  let cut
  const branches = {}
  try {
    const crew = readJson(join(crewHome, 'crew.json'))
    const creds = readJson(join(crewHome, 'creds.json'))
    const board = runner('get_board', { board: creds.board?.id, detail: 'titles', columns: GATE_COLUMNS, limit: CEILING })
    ;({ cards, cut } = gateCards(board, keyOfName(crew.people)))
    for (const c of cut) console.log(`page cut: ${c.column} shows ${c.shown} of ${c.total}; ${CEILING} is the ceiling per column, the cards past it are not checked`)
    if (!cards.length) {
      console.log('dev copies: no card in Verify UX or Verify QA; nothing to check')
      process.exit(0)
    }
    for (const card of cards) branches[card.id] = branchOf(runner('get_task', { id: card.id }))
  } catch (error) {
    console.error(`crew dev-copies: ${error.message}`)
    process.exit(1)
  }
  const result = copyLines(cards, { probe: probeHttp, branches })
  for (const line of result.lines) console.log(line)
  process.exit(result.ok && !cut.length ? 0 : 1)
}
