#!/usr/bin/env node
// `crew dev-copies`: after `crew up`, restarts the workers' dev copies that a QA card needs: a worker with a card in
// Verify UX or Verify QA has a dev copy served on the card's branch, so the testers find it answering. Each worker's
// copy is set in crew.json under "devCopies": { "<key>": { "port": 3101, "worktree": "<path>" } }. A copy that answers
// is left alone; one that does not is started through detach.sh (its own detached tmux session) with
// $CREW_HOME/bin/devserver-worker.sh. One line per worker. Nothing is started for a worker with no card to test, and a
// worker with no worktree in crew.json is reported, not guessed.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boardCall } from './board-call.mjs'
import { restartBrief, PEOPLE } from './restart-brief.mjs'

export const QA_COLUMN = /^Verify (UX|QA)/i

// The people whose card is waiting for a tester on a copy of their own.
export function needingCopies(briefs) {
  return briefs
    .filter(b => b.blocks.some(block => QA_COLUMN.test(block.column)))
    .map(b => b.who)
}

// One line and its verdict per worker: already answering, started, or why not.
export function copyPlan(people, { config, probe, start }) {
  const lines = []
  let ok = true
  for (const who of people) {
    const copy = config?.[who]
    if (!copy || !copy.port || !copy.worktree) {
      ok = false
      lines.push(`${who}: not restarted: no dev copy (port and worktree) set in crew.json "devCopies"`)
      continue
    }
    if (probe(copy.port)) {
      lines.push(`${who}: already answering on :${copy.port}`)
      continue
    }
    const started = start(who, copy)
    if (started.ok && probe(copy.port)) {
      lines.push(`${who}: started on :${copy.port}`)
    } else {
      ok = false
      lines.push(`${who}: failed on :${copy.port}: ${started.reason || 'it does not answer after the start'}`)
    }
  }
  return { lines, ok }
}

export function probeHttp(port) {
  const run = spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '5', `http://localhost:${port}/`], { encoding: 'utf8' })
  return run.status === 0 && /^[23]\d\d$/.test(run.stdout.trim())
}

// Starts the worker's copy in its own detached session, through detach.sh, with the crew's devserver-worker.sh.
export function startCopy(crewHome, who, copy, kit) {
  const session = `devcopy-${who}`
  const command = `sh ${join(crewHome, 'bin', 'devserver-worker.sh')} ${who} ${copy.worktree}`
  const run = spawnSync('sh', [join(kit, 'detach.sh'), 'start', join(crewHome, 'tmux.sock'), session, command], { encoding: 'utf8', timeout: 60000 })
  if (run.status !== 0) return { ok: false, reason: (run.stderr || run.stdout || 'detach.sh failed').trim().slice(0, 200) }
  return { ok: true }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const crewHome = process.env.CREW_HOME
  if (!crewHome) {
    console.error('crew dev-copies: CREW_HOME is not set')
    process.exit(2)
  }
  const kit = dirname(fileURLToPath(import.meta.url))
  const file = join(crewHome, 'crew.json')
  const config = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  let briefs
  try {
    briefs = restartBrief(PEOPLE, (who, tool, args) => boardCall(who, tool, args, kit))
  } catch (error) {
    console.error(`crew dev-copies: ${error.message}`)
    process.exit(1)
  }
  const people = needingCopies(briefs)
  if (!people.length) {
    console.log('dev copies: no worker has a card in Verify UX or Verify QA; nothing to restart')
    process.exit(0)
  }
  const result = copyPlan(people, {
    config: config.devCopies,
    probe: probeHttp,
    start: (who, copy) => startCopy(crewHome, who, copy, kit)
  })
  for (const line of result.lines) console.log(line)
  process.exit(result.ok ? 0 : 1)
}
