// `crew <who> prepare worktree <task-id>` and `crew <who> prepare worktree --remove <task-id>`: the command the dispatcher
// (crew.mjs) runs. It reads the card's title through the board tools, runs the project script, and prints the one result
// line. --remove removes the worktree only when prepare-worktree.mjs's removePlan allows it (clean, pushed, nothing ahead).

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareWorktree, removePlan } from './prepare-worktree.mjs'

const kit = dirname(fileURLToPath(import.meta.url))
const [who, ...rest] = process.argv.slice(2)
const remove = rest.includes('--remove')
const taskId = rest.find(arg => arg !== '--remove')

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!who || !taskId) fail('usage: crew <who> prepare worktree [--remove] <task-id>')

const crewHome = process.env.CREW_HOME
const config = crewHome && existsSync(join(crewHome, 'crew.json')) ? JSON.parse(readFileSync(join(crewHome, 'crew.json'), 'utf8')) : {}
// The worktree folders sit next to the crew home's own project folder: CREW_HOME is <folder>/.config/taskmanager-crew,
// so the folder is two levels up. crew.json may name it instead (worktreeBase).
const base = config.worktreeBase ?? (crewHome ? dirname(dirname(crewHome)) : null)
if (!base) fail('CREW_HOME is not set and crew.json has no worktreeBase; the worktree folder cannot be found')
const worktree = join(base, `taskmanager-${who}-${taskId.slice(0, 8)}`)

function git(args) {
  const run = spawnSync('git', ['-C', worktree, ...args], { encoding: 'utf8' })
  return { status: run.status ?? 1, stdout: (run.stdout ?? '').trim() }
}

if (remove) {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout
  const plan = removePlan({
    dirty: git(['status', '--porcelain']).stdout !== '',
    branchPushed: git(['rev-parse', '--verify', '--quiet', `origin/${branch}`]).status === 0,
    aheadOfRemote: Number(git(['rev-list', '--count', `origin/${branch}..HEAD`]).stdout || 0)
  })
  if (!plan.ok) fail(plan.message)
  const removed = spawnSync('git', ['worktree', 'remove', worktree], { encoding: 'utf8' })
  if (removed.status !== 0) fail(`git could not remove the worktree: ${(removed.stderr ?? '').trim()}`)
  console.log(`removed worktree ${worktree} (branch ${branch} is on origin)`)
  process.exit(0)
}

// The card's title, for the branch name: read through the board tools as this person.
const card = spawnSync(process.execPath, [join(kit, 'tm.mjs'), who, 'mcp', 'get_task', JSON.stringify({ id: taskId })], { encoding: 'utf8' })
let title = ''
try {
  title = JSON.parse(card.stdout).title ?? ''
} catch {
  fail(`could not read the card ${taskId}; the board tools said: ${(card.stderr || card.stdout).trim().slice(0, 200)}`)
}

const result = prepareWorktree({ who, taskId, title, config })
if (!result.ok) fail(result.message)
console.log(result.line)
