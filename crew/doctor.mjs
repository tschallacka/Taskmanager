#!/usr/bin/env node
// `crew doctor` (card mwk8koh1xf1jikjrkff, step 3): for each person with a recorded session, the three paths the session needs
// (its own folder, the crew home, the kit folder) and whether Claude Code trusts each one, and the exact fix when one does not.
// A folder the crew did not make is listed as refused: crew update does not trust it. Reads only; it writes nothing.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { configFile, isCrewOwned, readWorktreeBase, sessionRecords } from './claude-trust.mjs'
import { crewHome, kitDir } from './home.mjs'

function trustedIn(projects, path) {
  return projects?.[path]?.hasTrustDialogAccepted === true
}

/** The projects of the config file. A file that is not valid JSON gives configError: no path can be read as trusted from it. */
function readProjects(file) {
  if (!existsSync(file)) return { projects: {}, configError: null }
  try {
    return { projects: JSON.parse(readFileSync(file, 'utf8')).projects ?? {}, configError: null }
  } catch {
    return { projects: {}, configError: `${file} is not valid JSON, so crew doctor cannot read which folders are trusted.` }
  }
}

/**
 * The report: a row per person and path, the refused folders, and the fix line (null when every crew path is trusted). A row's
 * `trusted` is null when the config cannot be read; then the fix line says to repair the file, not to run crew update.
 */
export function trustReport({ home, kit, file = configFile(), worktreeBase = readWorktreeBase(home) }) {
  const { projects, configError } = readProjects(file)
  const trusted = path => (configError ? null : trustedIn(projects, path))
  const rows = []
  for (const { who, folder } of sessionRecords(home)) {
    const crew = isCrewOwned(folder, { home, kit, worktreeBase })
    rows.push({ who, role: 'session folder', path: folder, trusted: trusted(folder), crew })
    rows.push({ who, role: 'crew home', path: home, trusted: trusted(home), crew: true })
    rows.push({ who, role: 'kit folder', path: kit, trusted: trusted(kit), crew: true })
  }
  const refused = [...new Set(rows.filter(r => !r.crew).map(r => r.path))].sort()
  const untrusted = rows.filter(r => r.crew && !r.trusted)
  let fix = null
  if (configError) fix = `${file} is not valid JSON: fix or move it, then run crew update again.`
  else if (untrusted.length > 0) fix = 'crew update trusts the crew home, the kit folder and the crew folders above: run crew update.'
  return { rows, refused, fix, configError }
}

/** The report as lines for a person to read. */
export function formatReport(report) {
  if (report.rows.length === 0) return 'no sessions are recorded: nothing to trust yet (crew session start records one)'
  const lines = report.rows.map((r) => {
    if (!r.crew) return `${r.who}: ${r.role} ${r.path} is not a crew folder: the kit does not trust it, and crew update does not either. Trust it in Claude Code yourself, or start the session in a crew folder.`
    const state = r.trusted === null ? 'unknown (the config file cannot be read)' : (r.trusted ? 'trusted' : 'not trusted')
    return `${r.who}: ${r.role} ${r.path} ${state}`
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
