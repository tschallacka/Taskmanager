// The settings file of one person's background session (card mwf45rzxf8z9wtv9nv). Each person gets CREW_HOME/settings/<key>.json
// (mode 600), and every start passes it as its one --settings file. It holds the crew-wide deny rules (the restart_self
// tool is refused for every agent: the crew restarts itself, not an agent), the person's own CREW_HOME, and remote control
// off. Later crew-wide deny rules are added to DENY_RULES here, and reach every person on the next start.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The tools every crew person is refused. */
export const DENY_RULES = ['mcp__git__restart_self']

const KEY = /^[a-z][a-z0-9-]{0,31}$/

/** The settings object for one person. Pure: the same input always gives the same object. */
export function settingsFor({ home, key }) {
  if (!KEY.test(String(key ?? ''))) throw new Error(`no such person key: ${key}`)
  return {
    permissions: { deny: [...DENY_RULES] },
    env: { CREW_HOME: home },
    remoteControlAtStartup: false
  }
}

/** The path of one person's settings file under the crew home. */
export function settingsPath(home, key) {
  if (!KEY.test(String(key ?? ''))) throw new Error(`no such person key: ${key}`)
  return join(home, 'settings', `${key}.json`)
}

/** Writes the person's settings file (mode 600) and returns its path. Overwrites it: the file is generated, not edited. */
export function writeSettingsFile(home, key) {
  const path = settingsPath(home, key)
  mkdirSync(join(home, 'settings'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(settingsFor({ home, key }), null, 2)}\n`, { mode: 0o600 })
  return path
}
