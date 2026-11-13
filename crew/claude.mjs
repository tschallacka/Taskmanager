// crew claude [claude args...]   start Claude Code with the crew's long-run profile for this session only.
// Runs: claude --settings <kit>/claude-long-run.json [args...]. A session started without this wrapper,
// or without --settings, keeps Claude Code's own limits. The profile is checked against one Claude Code
// version (CHECKED_VERSION); a newer or older one may change the limits (see the README, "Claude Code limits").
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CHECKED_VERSION = '2.1.319'
export const profilePath = (kit) => join(kit, 'claude-long-run.json')

// Claude Code takes only the last --settings it is given, so two files do not merge. The PM's session needs the
// profile's env and the PM's hooks in ONE file: this merges them. The env of both is kept (the profile's wins on a
// name clash); the hooks come from the session file.
export function mergeSettings(profile, session) {
  return {
    ...session,
    ...profile,
    env: { ...(session.env ?? {}), ...(profile.env ?? {}) },
    hooks: { ...(session.hooks ?? {}), ...(profile.hooks ?? {}) },
  }
}

// Writes the merged file for a session (the PM's hooks) and returns its path.
export function writeMergedSettings(kit, sessionFile, outFile) {
  const profile = JSON.parse(readFileSync(profilePath(kit), 'utf8'))
  const session = JSON.parse(readFileSync(sessionFile, 'utf8'))
  writeFileSync(outFile, JSON.stringify(mergeSettings(profile, session), null, 2) + '\n')
  return outFile
}

// The argument list for claude: one --settings file, then whatever the owner passed. The file is the profile,
// or a merged file the PM's start line made with `crew claude merge`.
export function claudeArgs(kit, args = [], settingsFile = null) {
  return ['--settings', settingsFile ?? profilePath(kit), ...args]
}

// A warning when the installed Claude Code is older than the profile was checked against. The version
// text is `claude --version` output such as "2.1.319 (Claude Code)".
export function versionWarning(versionText) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(versionText || '')
  if (!m) return 'could not read the Claude Code version; the limits in the profile were checked against ' + CHECKED_VERSION
  const have = m.slice(1).map(Number)
  const want = CHECKED_VERSION.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (have[i] > want[i]) return null
    if (have[i] < want[i]) {
      return `Claude Code ${have.join('.')} is older than ${CHECKED_VERSION}, the version the profile was checked against`
    }
  }
  return null
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const kit = dirname(fileURLToPath(import.meta.url))
  const [first, ...rest] = process.argv.slice(2)
  if (first === 'version') {
    const v = spawnSync('claude', ['--version'], { encoding: 'utf8' })
    const text = (v.stdout || '').trim()
    console.log(text || 'claude --version printed nothing')
    const warn = versionWarning(text)
    if (warn) console.log(`warning: ${warn}`)
    process.exit(0)
  }
  if (first === 'merge') {
    // crew claude merge <session settings file> <out file>: one merged --settings file for the PM's start line.
    const [sessionFile, outFile] = rest
    if (!sessionFile || !outFile) {
      console.error('usage: crew claude merge <session settings file> <out file>')
      process.exit(2)
    }
    console.log(writeMergedSettings(kit, sessionFile, outFile))
    process.exit(0)
  }
  const args = first === undefined ? [] : [first, ...rest]
  const r = spawnSync('claude', claudeArgs(kit, args), { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}
