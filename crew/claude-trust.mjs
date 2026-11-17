// The trust of the crew's own folders in Claude Code's config file (card mwk8koh1xf1jikjrkff). Claude Code keeps trust per folder in
// `projects[<path>].hasTrustDialogAccepted`; a session started in a folder it does not trust fails with 'folder not trusted'. This
// module sets that flag for the exact paths it is given, and nothing else. The file is CLAUDE_CONFIG_DIR/.claude.json when that
// variable is set, else HOME/.claude.json. Claude Code writes the same file while it runs, so the change is made only if the file
// is the same as it was when we read it; otherwise it is re-read and the change redone, up to three tries. Nothing is written when
// the file is not valid JSON, or when it keeps changing.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join } from 'node:path'

export const MAX_TRIES = 3

/**
 * A folder the crew made: a worktree directly under crew.json worktreeBase, named taskmanager-<...>. The repository itself
 * (taskmanager, no dash) and any folder the owner points a session at are not crew folders.
 */
export function isCrewFolder(path, worktreeBase) {
  return typeof path === 'string' && typeof worktreeBase === 'string' && dirname(path) === worktreeBase && /^taskmanager-./.test(basename(path))
}

/**
 * A folder that is the crew's own for trust: a crew folder, or the crew home or the kit folder itself (the trust already covers them,
 * and a session record may name the home as its folder).
 */
export function isCrewOwned(path, { home, kit, worktreeBase }) {
  return path === home || path === kit || isCrewFolder(path, worktreeBase)
}

/**
 * The paths the kit may trust: the crew home, the installed kit folder, and each recorded session folder that is a crew folder.
 * `refused` lists the session folders the kit will not trust (the owner pointed a session somewhere the crew did not make).
 */
export function crewOwnPaths({ home, kit, worktreeBase, folders = [] }) {
  const crew = folders.filter(f => isCrewOwned(f, { home, kit, worktreeBase }))
  const refused = [...new Set(folders.filter(f => !isCrewOwned(f, { home, kit, worktreeBase })))].sort()
  const trust = [...new Set([home, kit, ...crew])].filter(Boolean).sort()
  return { trust, refused }
}

/** Each recorded session in a crew home: { who, folder } from sessions/<key>.json. The mcp configs and a broken record are skipped. */
export function sessionRecords(home) {
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

/** The folder of every recorded session in a crew home: sessionRecords without the names. */
export function recordedFolders(home) {
  return sessionRecords(home).map(r => r.folder)
}

/** The worktreeBase of a crew home's crew.json, or null when it is not set (then no session folder counts as a crew folder). */
export function readWorktreeBase(home) {
  const file = join(home, 'crew.json')
  if (!existsSync(file)) return null
  try {
    const base = JSON.parse(readFileSync(file, 'utf8')).worktreeBase
    return typeof base === 'string' && isAbsolute(base) ? base.replace(/\/+$/, '') : null
  } catch {
    return null
  }
}

/**
 * What `crew update` (and the kit's self-update, which finishes through the same step) trusts: the crew home, the kit folder and the
 * recorded crew folders. `refused` lists the recorded folders the crew did not make. Returns the ensureTrusted result plus refused.
 */
export function trustCrewFolders({ home, kit, file = configFile(), worktreeBase = readWorktreeBase(home), folders = [] }) {
  const { trust, refused } = crewOwnPaths({ home, kit, worktreeBase, folders })
  return { ...ensureTrusted(trust, { file }), refused }
}

/** The sentence for a folder the kit does not trust: it names the path and says what crew update does. */
export function notTrustedReason(folder, worktreeBase) {
  const base = worktreeBase ? `${worktreeBase}/taskmanager-<who>-<id>` : 'the worktree base in crew.json'
  return `${folder} is not trusted by Claude Code, and the kit does not trust it: it trusts only the crew home, the kit folder and the worker folders the crew made (${base}). Run crew update to trust the crew's own folders. A folder you point a session at is not one of them: trust it in Claude Code yourself, or start the session in a crew folder.`
}

/**
 * Trust before a session starts: the crew home, the kit and the session folder, when the folder is a crew folder. Returns { ok,
 * reason }. A folder the crew did not make is refused with notTrustedReason, and nothing is written for it.
 */
export function trustForStart({ home, kit, folder, file = configFile(), worktreeBase = readWorktreeBase(home), folders = [] }) {
  if (!isCrewOwned(folder, { home, kit, worktreeBase })) return { ok: false, reason: notTrustedReason(folder, worktreeBase) }
  const { trust } = crewOwnPaths({ home, kit, worktreeBase, folders: [...folders, folder] })
  const res = ensureTrusted(trust, { file })
  return res.ok ? { ok: true, changed: res.changed } : { ok: false, reason: res.reason }
}

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
    // One backup, the file as it was before our first change; never overwritten. It is copied in the write's try, below.
    const out = `${JSON.stringify(data, null, 2)}\n`
    if (beforeRename) beforeRename()
    const now = existsSync(file) ? readFileSync(file, 'utf8') : '{}\n'
    if (now !== text) continue
    const tmp = `${file}.crew-tmp-${process.pid}`
    try {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
      if (!existsSync(backup) && existsSync(file)) copyFileSync(file, backup)
      writeFileSync(tmp, out, { mode: 0o600 })
      renameSync(tmp, file)
    } catch (error) {
      // A folder that cannot be made, a disk that is full: the caller gets a sentence, not an exception, and the file is as it was.
      return { ok: false, changed: [], reason: `${file} could not be written (${error.code || error.message}); nothing was written.` }
    }
    return { ok: true, changed }
  }
  return { ok: false, changed: [], reason: `${file} changed while crew update was writing it, ${MAX_TRIES} times; nothing was written. The next crew update retries.` }
}
