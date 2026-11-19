#!/usr/bin/env node
// `crew up [person]`, `crew restart [person]`, `crew stop [person]` (card mwmzv2jt): the recorded person sessions brought up,
// restarted or stopped, one line per person, with no person meaning everyone recorded. Each start resumes the recorded session
// id only (session.mjs, resumeOnly): a refused resume is reported as failed and is never followed by a fresh start.
//
//   up       a person whose session is running is reported as already running; otherwise it is resumed and woken once
//   restart  a running session is stopped, then resumed and woken once
//   stop     a running session is stopped by its recorded id; a session that is not running is reported, nothing else
//
// Pia has her own terminal (tmux session `pia`): pia-tmux.mjs starts, stops and restarts her, and her lines come first.
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crewHome } from './home.mjs'
import { liveById, readRecord, startSession, stopSession, validSessionId } from './session.mjs'
import { recordedKeys, realSessionDeps, RESTART_WAKE } from './sessions-up.mjs'
import { resolveStartRole, writeRoleFile } from './role-file.mjs'
import { piaControl, realPiaDeps, TIMEOUTS as PIA_TIMEOUTS } from './pia-tmux.mjs'

export const CONTROL_COMMANDS = ['up', 'restart', 'stop']
const PIA = 'pia'
const USAGE = 'usage: crew up|restart|stop [person]'
const KEY = /^[a-z][a-z0-9-]{0,31}$/

/** The command and the optional person key from the argv after `crew`, or { error } when it is not one of the three. */
export function parseControl(argv) {
  const [command, person, ...extra] = argv
  if (!CONTROL_COMMANDS.includes(command) || extra.length) return { error: USAGE }
  if (person === undefined) return { command, person: null }
  if (!KEY.test(person)) return { error: `no such person key: ${person}` }
  return { command, person }
}

/**
 * Runs one control command for the person (or every recorded person). `deps` are the real ones in production (see
 * realControlDeps) and fakes in the tests: `listAgents()`, `stop({ key })`, `resolveRole({ key })` (the role, or a reason),
 * `start({ key, folder, role, resumeOnly })` and `wake({ key, id, text })`. `deps.pia(command)` is Pia's own control (pia-tmux.mjs):
 * `{ ok, lines }`. Returns the lines and whether all went through.
 */
export async function controlPeople(command, person, { home, deps }) {
  const keys = person ? [person] : [PIA, ...recordedKeys(home).filter(key => key !== PIA)]
  const list = deps.listAgents()
  const lines = []
  let ok = true
  const fail = (key, why) => {
    ok = false
    lines.push(`${key}: failed: ${why}`)
  }
  for (const key of keys) {
    if (key === PIA) {
      const out = await deps.pia(command)
      lines.push(...out.lines)
      if (!out.ok) ok = false
      continue
    }
    const record = readRecord(home, key)
    if (!record || !validSessionId(record.id)) {
      fail(key, `no recorded session; nothing to ${command}, start it by hand`)
      continue
    }
    const live = liveById(list, record.id)
    if (command === 'stop') {
      if (!live) {
        lines.push(`${key}: not running`)
        continue
      }
      const stopped = deps.stop({ key })
      if (stopped.ok) lines.push(`${key}: stopped ${record.id}`)
      else fail(key, `failed to stop ${record.id}: ${stopped.reason}`)
      continue
    }
    if (command === 'up' && live) {
      lines.push(`${key}: already running (${record.id})`)
      continue
    }
    if (command === 'restart' && live) {
      const stopped = deps.stop({ key })
      if (!stopped.ok) {
        fail(key, `failed to stop ${record.id}: ${stopped.reason}`)
        continue
      }
    }
    const resolved = deps.resolveRole({ key })
    if (resolved.reason) {
      fail(key, `${resolved.reason}; not started`)
      continue
    }
    const started = deps.start({ key, folder: record.folder, role: resolved.role, resumeOnly: true })
    if (!started.ok) {
      fail(key, started.reason)
      continue
    }
    const verb = command === 'restart' ? 'restarted' : 'started'
    const woke = await deps.wake({ key, id: started.id, text: RESTART_WAKE })
    if (woke.ok) lines.push(`${key}: ${verb} (${started.id}), woke once`)
    else {
      ok = false
      lines.push(`${key}: ${verb} (${started.id}), wake not sent: ${woke.reason}`)
    }
  }
  return { lines, ok }
}

/**
 * The production dependencies: the recorded sessions through session.mjs (the same claude and the same wake as `crew up`), the
 * role resolved as `crew session start` resolves it, and a start that never falls back to a fresh session.
 */
export function realControlDeps(home, kit) {
  const base = realSessionDeps(home, kit)
  const bin = process.env.CREW_CLAUDE_BIN || 'claude'
  return {
    listAgents: () => base.listAgents(),
    pia: command => piaControl(command, { deps: realPiaDeps(home, kit, { bin }), timeouts: PIA_TIMEOUTS }),
    stop: ({ key }) => stopSession({ home, key, bin }),
    resolveRole: ({ key }) => {
      const resolved = resolveStartRole({ home, key, promptsText: base.promptsText, crewText: base.crewText, env: process.env })
      if (resolved.reason) return { reason: resolved.reason }
      if (resolved.write) writeRoleFile(home, key, resolved.role)
      return { role: resolved.role }
    },
    start: ({ key, folder, role, resumeOnly }) => startSession({ home, kit, key, folder, role, bin, resumeOnly }),
    wake: base.wake
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const parsed = parseControl(process.argv.slice(2))
  if (parsed.error) {
    console.error(parsed.error)
    process.exit(64)
  }
  const home = crewHome()
  const kit = dirname(fileURLToPath(import.meta.url))
  const out = await controlPeople(parsed.command, parsed.person, { home, deps: realControlDeps(home, kit) })
  for (const line of out.lines) console.log(line)
  if (!out.lines.length) console.log('no recorded sessions: nothing to do')
  process.exit(out.ok ? 0 : 1)
}
