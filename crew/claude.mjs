// crew claude [claude args...]   start Claude Code with the crew's long-run profile for this session only.
// Runs: claude --settings <kit>/claude-long-run.json [args...]. A session started without this wrapper,
// or without --settings, keeps Claude Code's own limits. The profile is checked against one Claude Code
// version (CHECKED_VERSION); a newer or older one may change the limits (see the README, "Claude Code limits").
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CHECKED_VERSION = '2.1.319'
export const profilePath = (kit) => join(kit, 'claude-long-run.json')

// The argument list for claude: the profile first, then whatever the owner passed.
// A session file (the PM's hooks, pia-session.settings.json) is passed by the PM's start line in PROMPTS.md
// as a second --settings, merged with the profile; the profile's env block is the only one.
export function claudeArgs(kit, args = []) {
  return ['--settings', profilePath(kit), ...args]
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
  const args = first === undefined ? [] : [first, ...rest]
  const r = spawnSync('claude', claudeArgs(kit, args), { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}
