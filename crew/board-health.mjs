#!/usr/bin/env node
// Is the board answering JSON? Used by the Stop hooks (card mwifm8qa5n044bzymkl) to tell a board outage from a listener
// that is really down. Prints one line, "up" or "down: <reason>", and exits 0 either way.
//   node board-health.mjs <crew home>
// The board is the base in creds.json; the probe is GET <base>/api/health and needs a JSON answer with status 200.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function boardHealth(base, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${base}/api/health`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) })
    if (res.status !== 200) return { up: false, reason: `status ${res.status}` }
    JSON.parse(await res.text())
    return { up: true, reason: '' }
  } catch {
    return { up: false, reason: 'no JSON answer (connection refused, a deploy, or HTML)' }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const home = process.argv[2] ?? ''
  let base = ''
  try {
    base = JSON.parse(readFileSync(join(home, 'creds.json'), 'utf8')).base ?? ''
  } catch {
    base = ''
  }
  if (!base) {
    console.log('down: no board address in creds.json')
  } else {
    const health = await boardHealth(base)
    console.log(health.up ? 'up' : `down: ${health.reason}`)
  }
}
