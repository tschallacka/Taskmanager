#!/usr/bin/env node
// `crew pia-health`: one line per finding about Pia's session, for Boss's watch and for a person who asks.
//   session    a Claude Code process whose working directory is Pia's pia-session folder
//   listener   a `listen.mjs pia` process (her own listener)
//   transcript her newest transcript was written in the last 20 minutes
//   dialog     not checked here: a dialog can only be seen on her terminal (`pia-term`, the next item)
// Exit 0 when the first three are fine, 1 when one is not. Read only.
import { existsSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { piaSessionName } from './pia-session.mjs'

export const FRESH_MINUTES = 20

// Process ids whose working directory is `folder`. `procDir` is /proc in a real run, a folder in a test.
export function processesIn(procDir, folder, matches) {
  if (!existsSync(procDir)) return []
  const found = []
  for (const pid of readdirSync(procDir)) {
    if (!/^\d+$/.test(pid)) continue
    let cwd = null
    let cmdline = ''
    try { cwd = readlinkSync(join(procDir, pid, 'cwd')) } catch { continue }
    try { cmdline = readFileSync(join(procDir, pid, 'cmdline'), 'utf8').split('\0').join(' ') } catch { cmdline = '' }
    if (folder && cwd !== folder) continue
    if (matches && !matches(cmdline)) continue
    found.push({ pid, cmdline })
  }
  return found
}

// The Claude Code process: its command starts with a `claude` program (`claude ...` or `/path/to/claude ...`).
const isClaude = cmdline => /^(\S*\/)?claude(\s|$)/.test(cmdline)
const isPiaListener = cmdline => /listen\.mjs\s+pia(\s|$)/.test(cmdline)

// The findings, as lines with a verdict: { ok, line }.
export function piaFindings({ crewHome, claudeDir, procDir, now = Date.now() }) {
  // The working directory of Pia's session is her pia-session folder itself (not the transcript folder).
  const workingDir = join(crewHome, 'pia-session')
  const out = []

  const sessions = processesIn(procDir, workingDir, isClaude)
  out.push(sessions.length
    ? { ok: true, line: `session: alive (pid ${sessions[0].pid})` }
    : { ok: false, line: 'session: not running (no Claude Code process in the pia-session folder)' })

  const listeners = processesIn(procDir, null, isPiaListener)
  out.push(listeners.length
    ? { ok: true, line: `listener: running (pid ${listeners[0].pid})` }
    : { ok: false, line: 'listener: not running (no `listen.mjs pia` process)' })

  const last = piaSessionName(crewHome, claudeDir)
  if (!last.ok) {
    out.push({ ok: false, line: `transcript: none (${last.reason})` })
  } else {
    const minutes = Math.floor((now - Date.parse(last.lastWrite)) / 60000)
    out.push(minutes <= FRESH_MINUTES
      ? { ok: true, line: `transcript: written ${minutes} min ago` }
      : { ok: false, line: `transcript: last written ${minutes} min ago (more than ${FRESH_MINUTES})` })
  }

  out.push({ ok: true, line: 'dialog: not checked here (it shows only on her terminal; pia-term reads it)' })
  return out
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const crewHome = process.env.CREW_HOME
  if (!crewHome) {
    console.error('crew pia-health: CREW_HOME is not set')
    process.exit(2)
  }
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  const findings = piaFindings({ crewHome, claudeDir, procDir: '/proc' })
  for (const f of findings) console.log(f.line)
  process.exit(findings.slice(0, 3).every(f => f.ok) ? 0 : 1)
}
