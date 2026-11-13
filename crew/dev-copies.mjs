#!/usr/bin/env node
// `crew dev-copies`: after `crew up`, checks the copy of each card that waits in Verify UX or Verify QA. Each worker's
// dev copy answers on the port crew.json "devServers" gives that worker (a map from its crew key to its port). The
// reader, whose key reads the board, is crew.json "reader". Nothing here names a person or a port.
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
// The board's ceiling of cards per column in one get_board answer.
export const CEILING = 200
export const GATE_COLUMNS = ['Verify UX', 'Verify QA']

/** The crew member whose key reads the board: crew.json "reader" (for example "pia"). No default: a name is config. */
export function readerOf(crew) {
  if (typeof crew?.reader !== 'string' || !crew.reader) {
    throw new Error('crew.json has no "reader" (the crew member whose key reads the board, for example "pia")')
  }
  return crew.reader
}

/**
 * The port each worker's dev copy answers on: crew.json "devServers", a map from a crew key to a port (the port the
 * devserver script serves that worker on). Empty when not set: each card then says so, and nothing is guessed.
 */
export function devServersOf(crew) {
  const map = crew?.devServers
  return map && typeof map === 'object' ? map : {}
}

/**
 * The working board's id, from crew.json's "board" url (…/projects/<id>). The gate cards sit on this board, not on the
 * crew-home board in creds.json. Throws when the url has no id, so the command fails loudly.
 */
export function workingBoardId(crew) {
  const match = /\/projects\/([\w-]+)/.exec(crew?.board?.url ?? '')
  if (!match) throw new Error('crew.json "board" has no url with /projects/<id>: the working board cannot be read')
  return match[1]
}

/**
 * The gate cards from one get_board answer, each with its owner's key (or the display name when no key matches), and
 * the gate columns that were cut at the page size. A column whose taskCount is above the tasks it shows is cut.
 * Throws when the answer has none of the gate columns: a board read that finds no gate column is an error, not "none".
 */
export function gateCards(board, keyOf) {
  const cards = []
  const cut = []
  if (!(board?.columns ?? []).some(column => UX_OR_QA_COLUMN.test(column.name))) {
    throw new Error(`the board read has no ${GATE_COLUMNS.join(' or ')} column (board ${board?.id ?? '?'}, ${board?.name ?? 'no name'})`)
  }
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

/**
 * The branch a card's GitHub links name, from one real get_task_github answer: { links: [{ kind, owner, repo, ref, url,
 * data }] } (the fields a real answer has: an issue link has ref "36" and no branch). A branch link names it in `ref`
 * (the help page: a link to .../tree/<branch>). A pull request link names its head branch in data.headRef. Null when
 * no link names one.
 */
export function branchOf(answer) {
  for (const link of answer?.links ?? []) {
    if (link?.kind === 'branch' && typeof link.ref === 'string' && link.ref) return link.ref
    if (link?.kind === 'pull' && typeof link.data?.headRef === 'string' && link.data.headRef) return link.data.headRef
  }
  return null
}

// The lines for the cards, and whether every card has a copy up. `ports` is crew.json's devServers; `probe(port)` says
// whether a copy answers there.
export function copyLines(cards, { ports = {}, probe, branches = {} }) {
  const lines = []
  let ok = true
  for (const card of cards) {
    const port = ports[card.who]
    const branch = branches[card.id] ?? null
    const head = `${card.who}: card ${card.id} [${card.column}]`
    if (!port) {
      ok = false
      lines.push(`${head}: no port for ${card.who} in crew.json "devServers", cannot check its copy`)
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
  let cards
  let cut
  let ports
  const branches = {}
  try {
    const crew = readJson(join(crewHome, 'crew.json'))
    const reader = readerOf(crew)
    const runner = (tool, args) => boardCall(reader, tool, args, kit)
    ports = devServersOf(crew)
    const board = runner('get_board', { board: workingBoardId(crew), detail: 'titles', columns: GATE_COLUMNS, limit: CEILING })
    ;({ cards, cut } = gateCards(board, keyOfName(crew.people)))
    for (const c of cut) console.log(`page cut: ${c.column} shows ${c.shown} of ${c.total}; ${CEILING} is the ceiling per column, the cards past it are not checked`)
    if (!cards.length) {
      console.log('dev copies: no card in Verify UX or Verify QA; nothing to check')
      process.exit(0)
    }
    for (const card of cards) branches[card.id] = branchOf(runner('get_task_github', { taskId: card.id }))
  } catch (error) {
    console.error(`crew dev-copies: ${error.message}`)
    process.exit(1)
  }
  const result = copyLines(cards, { probe: probeHttp, branches, ports })
  for (const line of result.lines) console.log(line)
  process.exit(result.ok && !cut.length ? 0 : 1)
}
