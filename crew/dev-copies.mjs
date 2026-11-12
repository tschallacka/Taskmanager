#!/usr/bin/env node
// `crew dev-copies`: after `crew up`, checks the copy of each card that waits in Verify UX or Verify QA. Each worker's
// dev copy is served on the port devserver-worker.sh gives that worker (wren 3101, wick 3102, wynn 3103, wade 3104).
// For each such card the check prints the owner, the card, the branch linked to the card, the port, and whether a copy
// answers there. A card with no copy answering gets one more line: `no copy: ask Boss: tester-copy.sh start <owner> <branch>`.
// It never starts anything: Boss starts the copy. Read only, apart from the board reads that restart-brief makes.
import { spawnSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boardCall } from './board-call.mjs'
import { restartBrief, PEOPLE } from './restart-brief.mjs'

export const QA_COLUMN = /^Verify (UX|QA)/i

// The port devserver-worker.sh serves each worker's copy on.
export const PORTS = { wren: 3101, wick: 3102, wynn: 3103, wade: 3104 }

// One entry per card in a Verify UX or Verify QA column.
export function qaCards(briefs) {
  const cards = []
  for (const b of briefs) {
    for (const block of b.blocks) {
      if (QA_COLUMN.test(block.column)) cards.push({ who: b.who, id: block.id, title: block.title, column: block.column })
    }
  }
  return cards
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
  const runner = (who, tool, args) => boardCall(who, tool, args, kit)
  let briefs
  try {
    briefs = restartBrief(PEOPLE, runner)
  } catch (error) {
    console.error(`crew dev-copies: ${error.message}`)
    process.exit(1)
  }
  const cards = qaCards(briefs)
  if (!cards.length) {
    console.log('dev copies: no card in Verify UX or Verify QA; nothing to check')
    process.exit(0)
  }
  const branches = {}
  for (const card of cards) {
    branches[card.id] = branchOf(runner(card.who, 'get_task', { id: card.id }))
  }
  const result = copyLines(cards, { probe: probeHttp, branches })
  for (const line of result.lines) console.log(line)
  process.exit(result.ok ? 0 : 1)
}
