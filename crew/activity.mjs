#!/usr/bin/env node
// What each crew agent Pia started is doing right now, read from its own transcript (no board, no guessing).
//   crew activity [hours]      agents whose transcript changed in the last <hours> (default 6)
// One line per crew member (newest agent per key), then Pia's own row:
//   <key>  <state>  <minutes since last step>  <what the last step was>
// States:
//   working    the last step is a tool call other than the listener, or a reply in progress (transcript moved < 5 min ago)
//   running    a tool call has been running for 5+ min with no result yet (a long test or build: fine, unless it is very long)
//   listening  waiting on listen.mjs: idle by design. Idle WITH a card in hand is what Susy reports.
//   ended      the agent's last message is plain text with no tool call and no listener of its own runs: it does
//              nothing until resumed
//   handedback the agent handed its work back to Pia (SubagentHandback): it does nothing until Pia resumes it
//   silent     no step for 15+ min and not listening: stuck, or the session is gone
// Susy uses it each round, and `crew watch-crew` reads it: a person who holds a card and is listening, ended or silent
// for 10+ min is idle with work. Read-only.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Pia's Claude Code process, as its command line reads on /proc.
export const PIA_PROCESS = ['claude', '--continue', '--model', 'haiku']

/** The Claude Code folder of Pia's session: its path with every "/" and "." turned into "-", under ~/.claude/projects. */
export function piaProjectsDir(crewHome, home = homedir()) {
  const slug = join(crewHome, 'pia-session').replace(/[/.]/g, '-')
  return join(home, '.claude', 'projects', slug)
}

/** The text of the newest assistant step and whether its tool call was answered. */
export function describeEntries(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    const content = e.message?.content
    if (e.message?.role !== 'assistant' || !Array.isArray(content)) continue
    const use = content.find(c => c.type === 'tool_use')
    const answered = entries.slice(i + 1).some(x => Array.isArray(x.message?.content) && x.message.content.some(c => c.type === 'tool_result'))
    if (!use) return { kind: 'text', what: (content.find(c => c.type === 'text')?.text ?? '').replace(/\s+/g, ' ').slice(0, 90) }
    const cmd = use.input?.command ?? use.input?.description ?? use.input?.prompt ?? JSON.stringify(use.input ?? {})
    return { kind: answered ? 'tool-done' : 'tool-open', tool: use.name, what: `${use.name}: ${String(cmd).replace(/\s+/g, ' ').slice(0, 90)}` }
  }
  return { kind: 'none', what: '' }
}

/** The keys whose crew.mjs or listen.mjs process runs, from the process command lines. */
export function listenersFrom(cmdlines) {
  const keys = new Set()
  for (const args of cmdlines) {
    // listen.mjs <key> and crew.mjs <key> ... (Susy's check, an update, a test run through the kit) both keep the
    // agent awake: it is woken when the command ends.
    const at = args.findIndex(a => a.endsWith('listen.mjs') || a.endsWith('crew.mjs'))
    if (at >= 0 && args[at + 1]) keys.add(args[at + 1])
  }
  return keys
}

/** The process command lines on this machine, one array of arguments per process. */
export function readCmdlines(procDir = '/proc') {
  const out = []
  for (const pid of readdirSync(procDir).filter(p => /^\d+$/.test(p))) {
    try {
      out.push(readFileSync(join(procDir, pid, 'cmdline'), 'utf8').split('\0'))
    } catch {
      // A process that ended while its command line was read: nothing to list.
    }
  }
  return out
}

function lastLines(file, n = 40) {
  const text = readFileSync(file, 'utf8')
  return text.trimEnd().split('\n').slice(-n).map((line) => {
    try {
      return JSON.parse(line)
    } catch {
      return null
    }
  }).filter(Boolean)
}

/** The state of one agent from its newest step, its age in minutes and whether its listener runs. */
export function stateOf({ last, mins, listening }) {
  if (/SubagentHandback/.test(last.what)) return 'handedback'
  if (/listen\.mjs/.test(last.what) || (last.kind === 'text' && listening)) return 'listening'
  if (last.kind === 'text') return 'ended'
  if (last.kind === 'tool-open' && mins >= 5) return mins >= 15 ? 'silent' : 'running'
  if (mins >= 15) return 'silent'
  return 'working'
}

/**
 * The rows: one per subagent key (newest transcript wins), and Pia's own row from the session transcript. `root` is
 * Pia's Claude Code folder, `cmdlines` the running processes, `alive` whether her Claude process runs.
 */
export function activityRows({ root, hours = 6, now = Date.now(), cmdlines = [], alive = false }) {
  const listeners = listenersFrom(cmdlines)
  const rows = new Map()
  const sessions = existsSync(root) ? readdirSync(root) : []
  for (const session of sessions) {
    const dir = join(root, session, 'subagents')
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir).filter(f => f.endsWith('.jsonl'))) {
      const file = join(dir, name)
      const mtime = statSync(file).mtimeMs
      if (now - mtime > hours * 3600_000) continue
      let meta = {}
      try {
        meta = JSON.parse(readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'))
      } catch {
        // No meta file: the key falls back to the transcript's own name.
      }
      const key = String(meta.agentType ?? '').replace(/^taskmanager-maintenance-/, '').split('-')[0] || name
      const prev = rows.get(key)
      if (prev && prev.mtime >= mtime) continue
      const last = describeEntries(lastLines(file))
      const mins = Math.floor((now - mtime) / 60_000)
      const state = stateOf({ last, mins, listening: listeners.has(key) })
      rows.set(key, { key, state, mins, what: last.what, agent: name.replace(/^agent-|\.jsonl$/g, ''), task: meta.description ?? '', mtime })
    }
  }

  // Pia is not an agent of her own session: she IS the session. Her row comes from the session transcript itself.
  const mains = sessions.filter(f => f.endsWith('.jsonl')).map(f => join(root, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  if (mains[0]) {
    const mtime = statSync(mains[0]).mtimeMs
    const mins = Math.floor((now - mtime) / 60_000)
    const last = describeEntries(lastLines(mains[0], 80).filter(e => !e.isSidechain))
    const own = listeners.has('pia')
    const state = !alive ? 'gone' : own ? (mins < 15 ? 'working' : 'listening') : mins >= 15 ? 'silent' : 'working'
    rows.set('pia', { key: 'pia', state, mins, what: `${alive ? '' : 'session not running. '}${own ? 'own listener running. ' : 'NO own listener. '}${last.what}`, agent: 'session', task: 'Pia, her own Claude Code session', mtime })
  }
  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/** Whether a command line is Pia's Claude Code process. */
export function isPiaProcess(args) {
  return PIA_PROCESS.every((word, i) => args[i] === word)
}

function main() {
  const crewHome = process.env.CREW_HOME ?? ''
  if (!crewHome) {
    console.error('crew activity: CREW_HOME is not set (the folder that holds crew.json)')
    return 64
  }
  const hours = Number(process.argv[2] ?? 6)
  const cmdlines = readCmdlines()
  const alive = cmdlines.some(isPiaProcess)
  for (const r of activityRows({ root: piaProjectsDir(crewHome), hours, cmdlines, alive })) {
    console.log(`${r.key.padEnd(7)} ${r.state.padEnd(9)} ${String(r.mins).padStart(4)} min  ${r.what}`)
    console.log(`${''.padEnd(7)} agent ${r.agent}: ${r.task}`)
  }
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main()
