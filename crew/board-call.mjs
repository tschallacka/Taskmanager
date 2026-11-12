// One board agent-tool call as a person, through tm.mjs: `crew <who> mcp <tool> <json>`. The result is the parsed JSON.
// A failed call or an answer that is not JSON is an error with the reason, never an empty result: a caller that read
// an error as "nothing there" would act on a board it could not see. Shared by janet.mjs and restart-brief.mjs.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

export function boardCall(who, tool, args, kit) {
  const run = spawnSync(process.execPath, [join(kit, 'tm.mjs'), who, 'mcp', tool, JSON.stringify(args)], { encoding: 'utf8', timeout: 120000 })
  if (run.status !== 0) throw new Error(`board call ${tool} as ${who} failed: ${(run.stderr || run.stdout || '').trim().slice(0, 300)}`)
  try {
    return JSON.parse(run.stdout)
  } catch {
    throw new Error(`board call ${tool} as ${who} did not return JSON`)
  }
}
