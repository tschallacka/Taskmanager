// `crew <who> prepare worktree <task-id>`: the kit side of starting a card. The kit knows nothing about the project: it
// runs the project's own script (crew.json "scripts.prepareWorktree", written by Boss) with the arguments <who> <task-id>
// <slug>, and reads the one result line the script prints: `worktree <path> branch <name> db <name>`. A project with no
// script gets a clear message instead. The script is the only place that touches git, the dependencies and the database.

import { spawnSync } from 'node:child_process'

/** The slug of a card's title for a branch name: lower case, words joined by dashes, at most 40 characters. */
export function slugOf(title) {
  const slug = String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return slug || 'card'
}

/** Reads the result line the project script prints. Returns null when the line is missing or malformed. */
export function parseResultLine(output) {
  const line = String(output ?? '')
    .split('\n')
    .map(text => text.trim())
    .find(text => text.startsWith('worktree '))
  if (!line) return null
  const match = /^worktree (\S+) branch (\S+) db (\S+)$/.exec(line)
  if (!match) return null
  return { path: match[1], branch: match[2], db: match[3] }
}

/**
 * Runs the project script for a card and returns its result. `config` is the parsed crew.json; `runner` runs a command
 * and returns { status, stdout, stderr } (the real one spawns it; tests pass a fake).
 */
export function prepareWorktree({ who, taskId, title, config, runner = runScript }) {
  const script = config?.scripts?.prepareWorktree
  if (!script) {
    return { ok: false, message: 'This project has no prepareWorktree script in crew.json (scripts.prepareWorktree). Ask Boss to add it; the kit does not set up worktrees itself.' }
  }
  const slug = slugOf(title)
  const run = runner(script, [who, taskId, slug])
  if (run.status !== 0) {
    return { ok: false, message: `The prepare-worktree script stopped (exit ${run.status}): ${String(run.stderr || run.stdout || '').trim().slice(0, 400)}` }
  }
  const result = parseResultLine(run.stdout)
  if (!result) {
    return { ok: false, message: 'The prepare-worktree script printed no result line (worktree <path> branch <name> db <name>).' }
  }
  return { ok: true, ...result, line: `worktree ${result.path} branch ${result.branch} db ${result.db}` }
}

/** The real runner: runs the script with no shell, so the arguments are never interpreted. */
export function runScript(script, args) {
  const child = spawnSync(script, args, { encoding: 'utf8', timeout: 30 * 60 * 1000 })
  return { status: child.status ?? 1, stdout: child.stdout ?? '', stderr: child.stderr ?? '' }
}
