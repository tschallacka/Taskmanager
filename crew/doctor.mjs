#!/usr/bin/env node
// `crew doctor` (card mwk8koh1xf1jikjrkff, step 3): for each person with a recorded session, the three paths the session needs
// (its own folder, the crew home, the kit folder) and whether Claude Code trusts each one, and the exact fix when one does not.
// A folder the crew did not make is listed as refused: crew update does not trust it. Reads only; it writes nothing.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configFile, isCrewOwned, readWorktreeBase } from './claude-trust.mjs'
import { crewHome, kitDir } from './home.mjs'

/** Each recorded session: { who, folder }, from sessions/<key>.json (the mcp configs are not records). */
function sessionRecords(home) {
  const dir = join(home, 'sessions')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.json') && !f.endsWith('.mcp.json'))
    .map((f) => {
      try {
        const folder = JSON.parse(readFileSync(join(dir, f), 'utf8')).folder
        return typeof folder === 'string' && folder.length > 0 ? { who: f.slice(0, -5), folder } : null
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

function trustedIn(projects, path) {
  return projects?.[path]?.hasTrustDialogAccepted === true
}

function readProjects(file) {
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf8')).projects ?? {}
  } catch {
    return {}
  }
}

/** The report: a row per person and path, the refused folders, and the fix line (null when every crew path is trusted). */
export function trustReport({ home, kit, file = configFile(), worktreeBase = readWorktreeBase(home) }) {
  const projects = readProjects(file)
  const rows = []
  for (const { who, folder } of sessionRecords(home)) {
    const crew = isCrewOwned(folder, { home, kit, worktreeBase })
    rows.push({ who, role: 'session folder', path: folder, trusted: trustedIn(projects, folder), crew })
    rows.push({ who, role: 'crew home', path: home, trusted: trustedIn(projects, home), crew: true })
    rows.push({ who, role: 'kit folder', path: kit, trusted: trustedIn(projects, kit), crew: true })
  }
  const refused = [...new Set(rows.filter(r => !r.crew).map(r => r.path))].sort()
  const untrusted = rows.filter(r => r.crew && !r.trusted)
  const fix = untrusted.length > 0 ? 'crew update trusts the crew home, the kit folder and the crew folders above: run crew update.' : null
  return { rows, refused, fix }
}

/** The report as lines for a person to read. */
export function formatReport(report) {
  if (report.rows.length === 0) return 'no sessions are recorded: nothing to trust yet (crew session start records one)'
  const lines = report.rows.map((r) => {
    if (!r.crew) return `${r.who}: ${r.role} ${r.path} is not a crew folder: the kit does not trust it, and crew update does not either. Trust it in Claude Code yourself, or start the session in a crew folder.`
    return `${r.who}: ${r.role} ${r.path} ${r.trusted ? 'trusted' : 'not trusted'}`
  })
  lines.push(report.fix ?? 'all trusted: every crew path of every session is trusted in Claude Code')
  return lines.join('\n')
}

// Run as a script: the report of this crew home, printed. Exit 1 when a crew path is not trusted (the fix is crew update).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const report = trustReport({ home: crewHome(), kit: kitDir })
  console.log(formatReport(report))
  process.exit(report.fix ? 1 : 0)
}
