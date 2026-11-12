// The hooks the kit writes into a Claude Code session folder: one settings file, merged. Only the hook entries that name
// this kit's script (its file name, the marker) are replaced; every other key and every other hook in the file is kept,
// so a file edited by hand keeps its own settings. Used for Pia's session (pia-session.mjs) and Boss's (boss-session).
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
// The one shell-word rule of the kit lives in home.mjs, which has no side effects; this file must not load config.mjs.
import { shellWord } from './home.mjs'

export { shellWord }

const isOurs = (entry, marker) => (entry?.hooks ?? []).some(hook => String(hook?.command ?? '').includes(marker))

/**
 * Merges `hooks` (event -> entries) into `dir/file`, replacing the entries whose command names `marker`. Returns
 * { file, changed }. Throws when the existing file is not a JSON object, so the kit never overwrites a file it cannot read.
 */
export function writeHookSettings({ dir, file: name = 'settings.json', hooks, marker }) {
  const file = join(dir, '.claude', name)
  let settings = {}
  if (existsSync(file)) {
    try {
      settings = JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      throw new Error(`${file} is not valid JSON (${error.message}): fix or remove it, then run init again`)
    }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error(`${file} is not a JSON object`)
  }
  const merged = { ...(settings.hooks ?? {}) }
  for (const [event, wanted] of Object.entries(hooks)) {
    const kept = (merged[event] ?? []).filter(entry => !isOurs(entry, marker))
    merged[event] = [...kept, ...wanted]
  }
  const next = { ...settings, hooks: merged }
  if (existsSync(file) && JSON.stringify(next) === JSON.stringify(settings)) return { file, changed: false }
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`)
  return { file, changed: true }
}

/**
 * Adds `.claude/<name>` to the git exclude file of `dir` when `dir` is a git checkout, so a settings file that holds
 * this crew's paths is never committed. Returns true when it added the line.
 */
export function excludeFromGit(dir, entry) {
  const exclude = gitExcludeFile(dir)
  if (!exclude) return false
  mkdirSync(dirname(exclude), { recursive: true })
  const text = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
  if (text.split('\n').includes(entry)) return false
  appendFileSync(exclude, `${text && !text.endsWith('\n') ? '\n' : ''}${entry}\n`)
  return true
}

/**
 * The exclude file git reads for the checkout at `dir`, or null when `dir` is not a checkout. A normal checkout keeps
 * it in .git/info/exclude. A worktree has a .git FILE ("gitdir: <path>"): its exclude is the shared git directory's
 * info/exclude, which that gitdir names in its "commondir" file.
 */
export function gitExcludeFile(dir) {
  const dotGit = join(dir, '.git')
  if (!existsSync(dotGit)) return null
  if (statSync(dotGit).isDirectory()) return join(dotGit, 'info', 'exclude')
  const pointer = readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+)$/m)
  if (!pointer) return null
  const gitDir = resolve(dir, pointer[1].trim())
  const common = join(gitDir, 'commondir')
  const commonDir = existsSync(common) ? resolve(gitDir, readFileSync(common, 'utf8').trim()) : gitDir
  return join(commonDir, 'info', 'exclude')
}
