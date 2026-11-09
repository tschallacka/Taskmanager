// The hooks of the PM's own Claude Code session. init.mjs writes them into
// CREW_HOME/pia-session/.claude/settings.json: a Stop hook that keeps Pia's listener running (pia-listener-hook.sh)
// and a SessionStart hook that tells her to start it first. Only the hooks this kit names are replaced; every other
// key and every other hook in the file is kept, so a file Boss edited by hand keeps its own settings.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const HOOK_NAME = 'pia-listener-hook.sh'

/** Single-quotes a path for the shell, unless it is plain already. */
export function shellWord(text) {
  return /^[A-Za-z0-9_/.,:@+-]+$/.test(text) ? text : `'${text.replace(/'/g, `'\\''`)}'`
}

/** The two hook entries for a crew home and its kit folder, as Claude Code's settings.json reads them. */
export function piaHooks({ crewHome, kitDir }) {
  const command = event => `sh ${shellWord(join(kitDir, HOOK_NAME))} ${event} ${shellWord(crewHome)} ${shellWord(kitDir)}`
  return {
    Stop: [{ hooks: [{ type: 'command', command: command('stop') }] }],
    SessionStart: [{ matcher: 'startup|resume|compact', hooks: [{ type: 'command', command: command('sessionstart') }] }]
  }
}

const isOurs = entry => (entry?.hooks ?? []).some(hook => String(hook?.command ?? '').includes(HOOK_NAME))

/**
 * Writes the hooks into `sessionDir/.claude/settings.json`. Returns { file, changed }. Throws when the existing file is
 * not a JSON object, so the kit never overwrites a file it cannot read.
 */
export function writePiaHooks(sessionDir, options) {
  const file = join(sessionDir, '.claude', 'settings.json')
  let settings = {}
  if (existsSync(file)) {
    try {
      settings = JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      throw new Error(`${file} is not valid JSON (${error.message}): fix or remove it, then run init again`)
    }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error(`${file} is not a JSON object`)
  }
  const hooks = { ...(settings.hooks ?? {}) }
  for (const [event, wanted] of Object.entries(piaHooks(options))) {
    const kept = (hooks[event] ?? []).filter(entry => !isOurs(entry))
    hooks[event] = [...kept, ...wanted]
  }
  const next = { ...settings, hooks }
  if (existsSync(file) && JSON.stringify(next) === JSON.stringify(settings)) return { file, changed: false }
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`)
  return { file, changed: true }
}
