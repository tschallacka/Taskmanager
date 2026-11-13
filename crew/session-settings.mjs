// The settings file of one person's background session (card mwf45rzxf8z9wtv9nv). Each person gets CREW_HOME/settings/<key>.json
// (mode 600), and every start passes it as its one --settings file. It holds the crew-wide deny rules (the restart_self
// tool is refused for every agent: the crew restarts itself, not an agent), the long-run profile's env (the owner's
// timeouts, from claude-long-run.json in the kit, so a worker's long test jobs run as they do under `crew claude`), the
// person's own CREW_HOME, and remote control off. Later crew-wide deny rules are added to DENY_RULES here, and reach every
// person on the next start.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The tools every crew person is refused. */
export const DENY_RULES = ['mcp__git__restart_self']

const KEY = /^[a-z][a-z0-9-]{0,31}$/

/**
 * The env of the long-run profile in the kit folder: the owner's timeouts, as claude-long-run.json names them. A missing or
 * unreadable profile gives no env (the session still starts, with Claude Code's own limits).
 */
export function longRunEnv(kit) {
  const file = join(kit, 'claude-long-run.json')
  if (!existsSync(file)) return {}
  try {
    const env = JSON.parse(readFileSync(file, 'utf8'))?.env
    return env && typeof env === 'object' ? { ...env } : {}
  } catch {
    return {}
  }
}

/**
 * The settings object for one person. Pure: the same input always gives the same object. The profile env goes in first,
 * so the person's own CREW_HOME is never overridden by it.
 */
export function settingsFor({ home, key, profileEnv = {} }) {
  if (!KEY.test(String(key ?? ''))) throw new Error(`no such person key: ${key}`)
  return {
    permissions: { deny: [...DENY_RULES] },
    env: { ...profileEnv, CREW_HOME: home },
    remoteControlAtStartup: false
  }
}

/** The path of one person's settings file under the crew home. */
export function settingsPath(home, key) {
  if (!KEY.test(String(key ?? ''))) throw new Error(`no such person key: ${key}`)
  return join(home, 'settings', `${key}.json`)
}

/** Writes the person's settings file (mode 600) and returns its path. Overwrites it: the file is generated, not edited. */
export function writeSettingsFile(home, key, { profileEnv = {} } = {}) {
  const path = settingsPath(home, key)
  mkdirSync(join(home, 'settings'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(settingsFor({ home, key, profileEnv }), null, 2)}\n`, { mode: 0o600 })
  return path
}
