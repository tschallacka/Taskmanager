// `crew <who> serve` starts the dev copy of the worktree you are in on your person's port (crew.json devServers) and
// records it in the port registry. `--check` says which copy really answers on that port (a browser run calls it first).
// `--stop` stops your copy and frees the port. `--replace` also stops your own old copy on that port, and only that.
// The start command is crew.json scripts.serve, with {worktree}, {port} and {who} filled in.

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { join } from 'node:path'
import {
  aliveProcess, listenerPidOnPort, planRelease, servedCheck, planReserve, portOf, pruned, readRegistry, registryFile, stopGroup, taskOfBranch,
  withLock, writeRegistry
} from './port-registry.mjs'

const [who, ...flags] = process.argv.slice(2)
const mode = flags.includes('--check') ? 'check' : flags.includes('--stop') ? 'stop' : 'start'
const replace = flags.includes('--replace')

function fail(message, code = 1) {
  console.error(message)
  process.exit(code)
}

if (!who) fail('usage: crew <who> serve [--replace | --stop | --check]', 64)

const crewHome = process.env.CREW_HOME
if (!crewHome || !fs.existsSync(join(crewHome, 'crew.json'))) fail('CREW_HOME is not set, or it has no crew.json')
const config = JSON.parse(fs.readFileSync(join(crewHome, 'crew.json'), 'utf8'))
const port = portOf(config, who)
if (!port) fail(`crew.json devServers has no port for ${who}; Boss adds it.`)

function git(args, cwd = process.cwd()) {
  const run = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  return { status: run.status ?? 1, stdout: (run.stdout ?? '').trim() }
}

const top = git(['rev-parse', '--show-toplevel'])
if (top.status !== 0) fail('serve runs inside a worktree (a git checkout); this folder is not one.')
const worktree = top.stdout
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], worktree).stdout
const commit = git(['rev-parse', '--short', 'HEAD'], worktree).stdout
const task = taskOfBranch(branch)
const file = registryFile(crewHome)

/** The process that listens on the port: its pid and its working folder (null when nothing answers). */
function listener() {
  const pid = listenerPidOnPort(port)
  if (pid == null) return null
  let cwd = null
  try {
    cwd = fs.realpathSync(`/proc/${pid}/cwd`)
  } catch {
    // the process went away
  }
  return { pid, cwd }
}

const sameFolder = (a, b) => a && b && fs.realpathSync(a) === fs.realpathSync(b)

if (mode === 'check') {
  const found = listener()
  if (!found) fail(`nothing answers on port ${port}: start it with "crew ${who} serve".`, 4)
  if (!sameFolder(found.cwd, worktree)) {
    fail(`port ${port} is served from ${found.cwd} (pid ${found.pid}), not from this worktree ${worktree}. Stop that copy first, or run "crew ${who} serve --replace" if it is your own.`, 3)
  }
  // The commit the copy serves is the worktree HEAD recorded in the registry when the copy started (servedCheck).
  const verdict = servedCheck(pruned(readRegistry(file), aliveProcess).reg.ports[port], commit)
  if (!verdict.ok) fail(`port ${port}: ${verdict.message}. Run "crew ${who} serve --replace" to restart it from this worktree.`, 3)
  console.log(`serving ${verdict.commit} from ${worktree} on port ${port} (pid ${found.pid}, branch ${branch})`)
  process.exit(0)
}

if (mode === 'stop') {
  withLock(file, () => {
    const reg = pruned(readRegistry(file), aliveProcess).reg
    const plan = planRelease({ reg, port, worktree })
    if (!plan.ok) fail(plan.message)
    if (plan.noop) {
      console.log(`nothing is recorded on port ${port} for this worktree`)
      return
    }
    stopGroup(plan.stop)
    writeRegistry(file, plan.next)
    console.log(`stopped the copy on port ${port} (pid ${plan.stop ?? 'none'}) and freed it`)
  })
  process.exit(0)
}

// start (or --replace)
const script = config.scripts?.serve
if (!script) fail('crew.json has no scripts.serve: Boss adds the command that starts a dev copy ({worktree}, {port} and {who} are filled in).')

const started = withLock(file, () => {
  const reg = pruned(readRegistry(file), aliveProcess).reg
  const plan = planReserve({ reg, port, who, worktree, branch, task, alive: aliveProcess, replace })
  if (!plan.ok) return { error: plan.message }
  const mine = reg.ports[port]
  if (plan.same && mine?.pid && aliveProcess(mine.pid)) return { already: mine.pid }
  if (plan.stop) {
    stopGroup(plan.stop)
    console.log(`stopped your old copy on port ${port} (pid ${plan.stop}, worktree ${reg.ports[port].worktree})`)
    // give the old copy up to 5 s to let go of the port before the new one binds it
    for (let i = 0; i < 50 && listener(); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
  }
  const command = script.replaceAll('{worktree}', worktree).replaceAll('{port}', String(port)).replaceAll('{who}', who)
  const logDir = join(crewHome, 'work', who)
  fs.mkdirSync(logDir, { recursive: true })
  const log = fs.openSync(join(logDir, 'serve.log'), 'a')
  const child = spawn('sh', ['-c', command], { cwd: worktree, detached: true, stdio: ['ignore', log, log], env: { ...process.env, PORT: String(port) } })
  child.unref()
  fs.closeSync(log)
  // The worktree HEAD at start time: what this copy serves, for --check.
  const next = { ...plan.next, ports: { ...plan.next.ports, [port]: { ...plan.next.ports[port], pid: child.pid, commit } } }
  writeRegistry(file, next)
  return { pid: child.pid }
})

if (started.error) fail(started.error)
if (started.already) {
  console.log(`already serving ${commit} from ${worktree} on port ${port} (pid ${started.already})`)
  process.exit(0)
}

// Wait for the copy to answer from this worktree (a dev copy takes up to two minutes).
const deadline = Date.now() + 120000
for (;;) {
  const found = listener()
  if (found && sameFolder(found.cwd, worktree)) {
    console.log(`serving ${commit} from ${worktree} on port ${port} (pid ${found.pid}, branch ${branch})`)
    process.exit(0)
  }
  if (found && Date.now() > deadline) fail(`port ${port} is answered by ${found.cwd} (pid ${found.pid}), not by this worktree.`, 3)
  if (Date.now() > deadline) fail(`nothing answered on port ${port} after 2 minutes; see work/${who}/serve.log`, 4)
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)
}
