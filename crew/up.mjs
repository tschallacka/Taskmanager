#!/usr/bin/env node
// `crew up`: brings the crew's parts back in order after a restart, one line per part:
//   <part>: already running | started | failed: <why>
// The parts come from crew.json under "up": a list, in order. Each part names a `check` command (exit 0 when it
// is running) and a `start` command, and may name a `staleSocket` file to remove before starting (a socket left by a
// dead session makes a new one die at once, silently). The kit runs nothing it is not told to: a part with no `start`
// is only checked. Running it again changes nothing that is already running (idempotent).
//
// What is in crew.json is the machine's business: the dev database and dev copy (a devserver script), Pia's session
// (her start command, with `claude --continue` so she keeps her context), then the message that tells Pia to start the
// standing crew. The kit does not start Pia itself on a plain machine; see PROMPTS.md "Starting Pia".
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { realSessionDeps, upSessions } from './sessions-up.mjs'

// Runs a shell command; true when it exits 0.
export function shell(command, env) {
  const run = spawnSync('sh', ['-c', command], { encoding: 'utf8', env, timeout: 300000 })
  return { ok: run.status === 0, status: run.status, stderr: (run.stderr || run.stdout || '').trim().split('\n').pop() || '' }
}

// Brings each part up. `runner` runs a command (injected in tests); `remove` deletes a stale file.
export function upParts(parts, { runner = shell, remove = p => rmSync(p, { force: true }), env = process.env } = {}) {
  const lines = []
  let allOk = true
  for (const part of parts) {
    const name = part.name || '(unnamed)'
    if (part.check && runner(part.check, env).ok) {
      lines.push(`${name}: already running`)
      continue
    }
    if (!part.start) {
      allOk = false
      lines.push(`${name}: failed: not running, and no start command is set in crew.json`)
      continue
    }
    if (part.staleSocket) remove(part.staleSocket)
    const started = runner(part.start, env)
    const up = part.check ? runner(part.check, env).ok : started.ok
    if (started.ok && up) {
      lines.push(`${name}: started`)
    } else {
      allOk = false
      lines.push(`${name}: failed: ${started.ok ? 'started but the check still fails' : (started.stderr || `exit ${started.status}`)}`)
    }
  }
  return { lines, ok: allOk }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const crewHome = process.env.CREW_HOME
  if (!crewHome) {
    console.error('crew up: CREW_HOME is not set')
    process.exit(2)
  }
  const file = join(crewHome, 'crew.json')
  const config = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const parts = Array.isArray(config.up) ? config.up : []
  // The recorded person sessions come first: each one that is not running is started and woken once (card mwdblb506deyxnet5i7).
  const kit = dirname(fileURLToPath(import.meta.url))
  const sessions = await upSessions(crewHome, realSessionDeps(crewHome, kit))
  for (const line of sessions.lines) console.log(line)
  if (!parts.length && !sessions.lines.length) {
    console.error('crew up: crew.json has no "up" list, so there is nothing to bring up')
    process.exit(1)
  }
  const result = upParts(parts)
  for (const line of result.lines) console.log(line)
  process.exit(result.ok && sessions.ok ? 0 : 1)
}
