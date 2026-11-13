// `crew <who> prepare worktree <task-id>` and `crew <who> prepare worktree --remove <task-id>`: the command the dispatcher
// (crew.mjs) runs. It reads the card's title through the board tools, runs the project script, and prints the one result
// line. --remove removes the worktree only when prepare-worktree.mjs's removePlan allows it (clean, pushed, nothing ahead).

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareWorktree, removePlan, worktreeFolder } from './prepare-worktree.mjs'
import { aliveProcess, planRelease, planReserve, portOf, pruned, readRegistry, registryFile, stopGroup, withLock, writeRegistry } from './port-registry.mjs'

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
// The worktree folder comes from crew.json worktreeBase, which is required (no guessing from CREW_HOME).
const folder = worktreeFolder({ config, who, taskId })
if (!folder.ok) fail(folder.message)
const worktree = folder.path

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
  // the copy on the person's port stops and the port is freed before the folder goes
  const port = portOf(config, who)
  if (port) {
    withLock(registryFile(crewHome), () => {
      const reg = pruned(readRegistry(registryFile(crewHome)), aliveProcess).reg
      const entry = reg.ports[port]
      if (!entry || (entry.worktree !== worktree && entry.task !== taskId)) return
      const released = planRelease({ reg, port, worktree: entry.worktree })
      if (!released.ok) return
      stopGroup(released.stop)
      writeRegistry(registryFile(crewHome), released.next)
      console.log(`freed port ${port} (its copy stopped)`)
    })
  }
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

// Reserve the person's port for this worktree (no copy runs yet). A port held by another worktree is a warning: the
// worktree is ready either way, and the copy will refuse to start on that port until the holder stops.
const port = portOf(config, who)
if (port) {
  const reserved = withLock(registryFile(crewHome), () => {
    const reg = pruned(readRegistry(registryFile(crewHome)), aliveProcess).reg
    const plan = planReserve({ reg, port, who, worktree: result.path, branch: result.branch, task: taskId, alive: aliveProcess })
    if (plan.ok) writeRegistry(registryFile(crewHome), plan.next)
    return plan
  })
  if (reserved.ok) console.log(`port ${port}`)
  else console.error(`warning: ${reserved.message}`)
}
