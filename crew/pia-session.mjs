// The hooks of the PM's own Claude Code session. init.mjs writes them into
// CREW_HOME/pia-session/.claude/settings.json: a Stop hook that keeps Pia's listener running (pia-listener-hook.sh)
// and a SessionStart hook that tells her to start it first. The merge rules are session-hooks.mjs's.
import { shellWord, writeHookSettings } from './session-hooks.mjs'
import { join } from 'node:path'

export { shellWord }
export const HOOK_NAME = 'pia-listener-hook.sh'

/** The two hook entries for a crew home and its kit folder, as Claude Code's settings.json reads them. */
export function piaHooks({ crewHome, kitDir }) {
  const command = event => `sh ${shellWord(join(kitDir, HOOK_NAME))} ${event} ${shellWord(crewHome)} ${shellWord(kitDir)}`
  return {
    Stop: [{ hooks: [{ type: 'command', command: command('stop') }] }],
    SessionStart: [{ matcher: 'startup|resume|compact', hooks: [{ type: 'command', command: command('sessionstart') }] }]
  }
}

/**
 * Writes Pia's hooks into `sessionDir/.claude/settings.json`. Returns { file, changed }. Throws when the existing file is
 * not a JSON object, so the kit never overwrites a file it cannot read.
 */
export function writePiaHooks(sessionDir, options) {
  return writeHookSettings({ dir: sessionDir, file: 'settings.json', hooks: piaHooks(options), marker: HOOK_NAME })
}
