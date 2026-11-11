#!/usr/bin/env node
// `crew pia-session`: prints the name Pia's Claude Code session has now, as ListAgents shows it: `pia-session-<id>`.
// Claude Code keeps one transcript per session in the project folder of the session's working directory, and the
// id is the transcript's file name. So the newest transcript in Pia's folder is her current session. This only
// reads: it changes nothing. When there is no transcript (her session never started), it says so on stderr, exit 1.
//
// The id assumption is the one thing to check: the name ListAgents shows must be `pia-session-` plus this id. If a
// restart ever shows a different id, the kit's wording (PROMPTS.md "Talking to Pia") is still right, and this file
// is what to fix.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The folder Claude Code uses for a working directory: every "/" and "." becomes "-".
export function piaProjectDir(crewHome, claudeDir) {
  const cwd = join(crewHome, 'pia-session')
  return join(claudeDir, 'projects', cwd.replace(/[/.]/g, '-'))
}

// The name of Pia's newest session, or the reason there is none.
export function piaSessionName(crewHome, claudeDir) {
  const dir = piaProjectDir(crewHome, claudeDir)
  if (!existsSync(dir)) return { ok: false, reason: `no transcript folder for Pia at ${dir}` }
  let newest = null
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.jsonl')) continue
    const mtime = statSync(join(dir, file)).mtimeMs
    if (!newest || mtime > newest.mtime) newest = { file, mtime }
  }
  if (!newest) return { ok: false, reason: 'no Pia session transcript yet' }
  return {
    ok: true,
    name: `pia-session-${newest.file.replace(/\.jsonl$/, '')}`,
    lastWrite: new Date(newest.mtime).toISOString()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const crewHome = process.env.CREW_HOME
  if (!crewHome) {
    console.error('crew pia-session: CREW_HOME is not set')
    process.exit(2)
  }
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  const answer = piaSessionName(crewHome, claudeDir)
  if (!answer.ok) {
    console.error(`crew pia-session: ${answer.reason}`)
    process.exit(1)
  }
  console.log(answer.name)
  console.error(`last written ${answer.lastWrite}`)
}
