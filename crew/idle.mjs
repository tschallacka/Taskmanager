#!/usr/bin/env node
// Who of the crew is free, and what they may start next: one line per free worker, then the first
// startable Backlog cards. It reads crew_activity on the crew board, the same answer the office draws
// from, so Pia hands out work from what the office shows.
//   node idle.mjs [who]        who defaults to pia; prints only, changes nothing
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCreds } from './config.mjs'

const kit = dirname(fileURLToPath(import.meta.url))

// The tool's answer, as the tm.mjs client prints it: the JSON on its own line, after any warning.
export function parseActivity(text) {
  const line = String(text).split('\n').reverse().find(l => l.trim().startsWith('{'))
  if (!line) return null
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

const label = card => (card.assignedToMe ? `${card.title} (yours)` : `${card.title} (unassigned)`)

// The printed lines for one activity answer. Pure, so the kit test can check each rule.
export function formatIdle(activity) {
  if (!activity || !Array.isArray(activity.people)) return ['no crew activity to show']
  const workers = activity.people.filter(p => p.role === 'worker')
  const free = workers.filter(p => p.state === 'idle')
  const lines = []
  if (!free.length) lines.push('no idle worker')
  for (const worker of free) {
    const waiting = worker.waitingOn?.length ? `, waiting on ${worker.waitingOn.join('/')}` : ''
    const next = worker.next?.length ? worker.next.slice(0, 3).map(label).join('; ') : 'nothing startable in Backlog'
    lines.push(`idle ${worker.key} (${worker.name})${waiting}: ${next}`)
  }
  const startable = []
  for (const worker of free) {
    for (const card of worker.next ?? []) if (!startable.some(c => c.id === card.id)) startable.push(card)
  }
  if (startable.length) lines.push(`startable: ${startable.slice(0, 5).map(c => `${c.id} ${label(c)}`).join(' | ')}`)
  return lines
}

function main() {
  const who = process.argv[2] || 'pia'
  const creds = loadCreds()
  const run = spawnSync(process.execPath, [join(kit, 'tm.mjs'), who, 'mcp', 'crew_activity', JSON.stringify({ board: creds.board.id })], { encoding: 'utf8' })
  if (run.status !== 0) {
    console.error(`crew_activity failed (exit ${run.status}): ${(run.stderr || run.stdout || '').trim().slice(0, 300)}`)
    process.exit(1)
  }
  for (const line of formatIdle(parseActivity(run.stdout))) console.log(line)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
