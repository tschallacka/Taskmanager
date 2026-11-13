// The Stop hook of Boss's Claude Code session. init.mjs writes it into the folder set as "bossSession" in crew.json, as
// .claude/settings.local.json (never committed: the folder's git exclude gets the path when the folder is a checkout).
// The hook (boss-stop-hook.sh) blocks Boss from ending a turn while `crew boss-mentions` or `crew watch-crew` is not
// running as a Monitor. The merge rules are session-hooks.mjs's.
import { excludeFromGit, shellWord, writeHookSettings } from './session-hooks.mjs'
import { join } from 'node:path'

export const BOSS_HOOK_NAME = 'boss-stop-hook.sh'
export const BOSS_SETTINGS = 'settings.local.json'

/** The Stop hook entry for a crew home and its kit folder. */
export function bossHooks({ crewHome, kitDir }) {
  const command = `sh ${shellWord(join(kitDir, BOSS_HOOK_NAME))} ${shellWord(crewHome)} ${shellWord(kitDir)}`
  return { Stop: [{ hooks: [{ type: 'command', command }] }] }
}

/** Writes Boss's Stop hook into `sessionDir/.claude/settings.local.json` and keeps that file out of git. */
export function writeBossHooks(sessionDir, options) {
  const result = writeHookSettings({ dir: sessionDir, file: BOSS_SETTINGS, hooks: bossHooks(options), marker: BOSS_HOOK_NAME })
  const excluded = excludeFromGit(sessionDir, `.claude/${BOSS_SETTINGS}`)
  return { ...result, excluded }
}
