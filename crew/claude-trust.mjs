// The trust of the crew's own folders in Claude Code's config file (card mwk8koh1xf1jikjrkff). Claude Code keeps trust per folder in
// `projects[<path>].hasTrustDialogAccepted`; a session started in a folder it does not trust fails with 'folder not trusted'. This
// module sets that flag for the exact paths it is given, and nothing else. The file is CLAUDE_CONFIG_DIR/.claude.json when that
// variable is set, else HOME/.claude.json. Claude Code writes the same file while it runs, so the change is made only if the file
// is the same as it was when we read it; otherwise it is re-read and the change redone, up to three tries. Nothing is written when
// the file is not valid JSON, or when it keeps changing.
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

export const MAX_TRIES = 3

/** The config file this user's Claude Code reads: CLAUDE_CONFIG_DIR/.claude.json when set, else HOME/.claude.json. */
export function configFile(env = process.env, home = homedir()) {
  return env.CLAUDE_CONFIG_DIR ? join(env.CLAUDE_CONFIG_DIR, '.claude.json') : join(home, '.claude.json')
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * Sets hasTrustDialogAccepted for each given absolute path. Returns { ok, changed, reason }: `changed` lists the paths whose flag was
 * set by this call (empty when they were trusted already); `reason` is a sentence when ok is false.
 * `beforeRename` is a test seam: it runs after the change is computed and before the file is checked and renamed.
 */
export function ensureTrusted(paths, { file = configFile(), beforeRename } = {}) {
  const bad = paths.find(p => typeof p !== 'string' || !isAbsolute(p))
  if (bad !== undefined) return { ok: false, changed: [], reason: `not an absolute path: ${bad}; nothing was written` }
  const backup = `${file}.crew-backup`
  for (let attempt = 1; attempt <= MAX_TRIES; attempt += 1) {
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '{}\n'
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = undefined
    }
    if (!isObject(data)) return { ok: false, changed: [], reason: `${file} is not valid JSON; nothing was written. Fix or move the file, then run crew update again.` }
    const projects = isObject(data.projects) ? data.projects : {}
    const changed = []
    for (const path of paths) {
      const entry = isObject(projects[path]) ? projects[path] : {}
      if (entry.hasTrustDialogAccepted === true) continue
      projects[path] = { ...entry, hasTrustDialogAccepted: true }
      changed.push(path)
    }
    if (changed.length === 0) return { ok: true, changed: [] }
    data.projects = projects
    // One backup, the file as it was before our first change; never overwritten.
    if (!existsSync(backup) && existsSync(file)) copyFileSync(file, backup)
    const out = `${JSON.stringify(data, null, 2)}\n`
    if (beforeRename) beforeRename()
    const now = existsSync(file) ? readFileSync(file, 'utf8') : '{}\n'
    if (now !== text) continue
    const tmp = `${file}.crew-tmp-${process.pid}`
    writeFileSync(tmp, out, { mode: 0o600 })
    renameSync(tmp, file)
    return { ok: true, changed }
  }
  return { ok: false, changed: [], reason: `${file} changed while crew update was writing it, ${MAX_TRIES} times; nothing was written. The next crew update retries.` }
}
