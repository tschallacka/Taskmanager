#!/usr/bin/env node
// The lab runner (card mwdkxbr0thtrcnc7mbi, slice 1): its own process, in its own tmux session started by crew up, NOT
// inside the Susy daemon. Each tick: it reads the request files `crew <who> lab submit` wrote and queues them; it runs the
// first queued sample, one at a time, after taking the heavy-job slot (heavy-slot.json, mode 600); it runs crew/lab-run.sh
// for the sample and records the RESULT line; and it releases the slot. Nothing here pushes, merges, commits or touches a
// database except the scratch one lab-run.sh makes for the sample.
//
//   node crew/lab-runner.mjs once     one tick, then exit (drains requests, runs at most one sample)
//   node crew/lab-runner.mjs loop     ticks every 20 s until stopped
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseResult, finish, labDir, markRunning, nextJob, requeueRunning, requestDir, validId, validSample, enqueue, withQueue } from './lab-queue.mjs'
import { aliveProcess } from './port-registry.mjs'

export const TICK_MS = 20_000
export const RUN_TIMEOUT_MS = 60 * 60 * 1000
export const GRANT_BEAT_MS = 5 * 60 * 1000
const kit = dirname(fileURLToPath(import.meta.url))

/**
 * Reads the request files (requests/*.json), queues each valid one and moves it to requests/done or requests/rejected.
 * Returns one line per request: queued or rejected, with the reason. `now` and `withQueueFn` are injectable for the tests.
 */
export function drainRequests(home, { now = new Date().toISOString(), withQueueFn = withQueue } = {}) {
  const dir = requestDir(home)
  if (!fs.existsSync(dir)) return []
  const lines = []
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.json')).sort()) {
    const path = join(dir, name)
    const label = name.replace(/\.json$/, '')
    let request
    try {
      request = JSON.parse(fs.readFileSync(path, 'utf8'))
    } catch {
      moveTo(dir, 'rejected', name, 'not JSON')
      lines.push(`rejected ${label}: not JSON`)
      continue
    }
    // The id becomes a folder name (lab/<id>): it must be the shape lab.mjs writes, checked before anything else.
    if (!validId(request.id)) {
      moveTo(dir, 'rejected', name, 'the id is not a sample id')
      lines.push(`rejected ${label}: the id is not a sample id`)
      continue
    }
    const check = validSample(request)
    if (!check.ok) {
      moveTo(dir, 'rejected', name, check.message)
      lines.push(`rejected ${request.id}: ${check.message}`)
      continue
    }
    const id = String(request.id)
    const out = withQueueFn(home, queue => {
      const added = enqueue(queue, check.sample, { id, by: String(request.by ?? '?'), now })
      if (!added.ok) return { result: { ok: false, message: added.message } }
      return { result: { ok: true, position: added.position }, queue: added.queue }
    })
    if (out.ok) {
      moveTo(dir, 'done', name, `queued at ${out.position}`)
      lines.push(`queued ${id} at ${out.position}: ${check.sample.branch}`)
    } else {
      moveTo(dir, 'rejected', name, out.message)
      lines.push(`rejected ${id}: ${out.message}`)
    }
  }
  return lines
}

function moveTo(dir, sub, name, reason) {
  const target = join(dir, sub)
  fs.mkdirSync(target, { recursive: true })
  fs.renameSync(join(dir, name), join(target, name))
  fs.writeFileSync(join(target, `${name}.reason`), `${reason}\n`)
}

/** After a restart, a job that was running is queued again (once); see requeueRunning. */
export function recoverAfterRestart(home, now = new Date().toISOString()) {
  withQueue(home, queue => ({ result: null, queue: requeueRunning(queue, now) }))
}

/**
 * One tick: runs the first queued sample if the slot is granted. `slot` is { acquire(purpose) -> { granted, holder? },
 * release() }; `runJob(job)` -> { stdout, timedOut }. Returns what happened, for the log and the tests.
 */
export async function runOne(home, { slot, runJob, now = () => new Date().toISOString(), beatMs = GRANT_BEAT_MS }) {
  const job = withQueue(home, queue => ({ result: nextJob(queue) }))
  if (!job) return { idle: true }
  const got = slot.acquire(job.id)
  if (!got.granted) return { waiting: true, job: job.id, holder: got.holder ?? null }
  let result
  // The grant lasts 60 minutes and a run may last as long as RUN_TIMEOUT_MS: the grant is refreshed while the run goes on,
  // so another asker is not granted the slot while lab still runs.
  const beat = setInterval(() => slot.refresh?.(), beatMs)
  try {
    withQueue(home, queue => ({ result: null, queue: markRunning(queue, job.id, now()) }))
    const out = await runJob(job)
    fs.mkdirSync(join(labDir(home), job.id), { recursive: true })
    fs.writeFileSync(join(labDir(home), job.id, 'runner.log'), out.stdout ?? '')
    result = out.timedOut ? { status: 'fail', stage: 'timeout', pass: 0, fail: 0 } : parseResult(out.stdout)
  } finally {
    clearInterval(beat)
    slot.release()
  }
  fs.writeFileSync(join(labDir(home), job.id, 'result.json'), `${JSON.stringify({ id: job.id, branch: job.branch, ...result, finished: now() }, null, 2)}\n`)
  withQueue(home, queue => ({ result: null, queue: finish(queue, job.id, result, now()) }))
  return { done: job.id, result }
}

/** The variables a lab run gets: PATH and HOME, the lab's own settings, and CREW_HOME. Nothing else from the runner's environment. */
export function jobEnv(home, base = process.env) {
  const keep = ['PATH', 'HOME', 'LAB_REPO', 'LAB_DB_BASE', 'LAB_PG', 'LAB_DRY']
  const env = {}
  for (const key of keep) if (base[key] !== undefined) env[key] = base[key]
  env.CREW_HOME = home
  return env
}

/**
 * Runs crew/lab-run.sh for one job and collects its output. A run over timeoutMs is killed. A spawn that fails (the shell
 * cannot start) is a failed run at stage spawn, not a crash of the runner. The child gets jobEnv(), nothing more.
 */
export function runJobScript(home, job, { script = join(kit, 'lab-run.sh'), timeoutMs = RUN_TIMEOUT_MS, shell = 'sh', base = process.env } = {}) {
  return new Promise(resolve => {
    const args = [script, job.id, job.branch]
    if (job.file) args.push(job.file, String(job.repeat ?? 1))
    let stdout = ''
    let timedOut = false
    let finished = false
    let timer = null
    const done = out => {
      if (finished) return
      finished = true
      if (timer) clearTimeout(timer)
      resolve(out)
    }
    let child
    try {
      child = spawn(shell, args, { env: jobEnv(home, base), stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      done({ stdout: `spawn failed: ${error.message}\nRESULT: fail stage=spawn pass=0 fail=0\n`, timedOut: false })
      return
    }
    timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stdout += d })
    child.on('error', error => {
      stdout += `spawn failed: ${error.message}\nRESULT: fail stage=spawn pass=0 fail=0\n`
      done({ stdout, timedOut: false })
    })
    child.on('close', () => done({ stdout, timedOut }))
  })
}

/** The slot, from crew/heavy-slot.mjs (its own branch: mwf201blsqvx3jczev). Loaded here, not at the top, so the tests need it not. */
export async function realSlot(home) {
  const heavy = await import(pathToFileURL(join(kit, 'heavy-slot.mjs')).href)
  return {
    acquire: purpose => {
      const procs = heavy.readProcs()
      const out = heavy.decideSlot({ home, asker: 'lab', purpose: `lab ${purpose}`, procs })
      return { granted: out.granted, holder: out.holder ?? null }
    },
    release: () => heavy.releaseGrant(home, 'lab'),
    // Moves the grant's `since` forward, only while lab still holds it: an expired or someone else's grant is left alone.
    refresh: () => {
      const found = heavy.readGrant(home)
      if (found && !found.expired && found.grant.holder === 'lab') heavy.writeGrant(home, { ...found.grant, since: Date.now() })
    }
  }
}

/** One runner only: its pid is in lab/runner.pid. A second start is refused while the first one is alive. */
export function claimRunner(home, pid = process.pid, alive = aliveProcess) {
  const file = join(labDir(home), 'runner.pid')
  const other = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8').trim()) : 0
  if (other && other !== pid && alive(other)) throw new Error(`another lab runner is running (pid ${other})`)
  fs.mkdirSync(labDir(home), { recursive: true })
  fs.writeFileSync(file, `${pid}\n`)
}

export async function main(argv, home) {
  const mode = argv[0] ?? 'once'
  fs.mkdirSync(labDir(home), { recursive: true })
  claimRunner(home)
  recoverAfterRestart(home)
  const slot = await realSlot(home)
  const tick = async () => {
    for (const line of drainRequests(home)) console.log(line)
    const r = await runOne(home, { slot, runJob: job => runJobScript(home, job) })
    if (r.done) console.log(`done ${r.done}: ${r.result.status} stage=${r.result.stage} pass=${r.result.pass} fail=${r.result.fail}`)
    if (r.waiting) console.log(`waiting for the heavy slot: ${r.holder ?? 'busy'}`)
  }
  if (mode === 'once') return tick()
  if (mode !== 'loop') throw new Error(`usage: lab-runner.mjs once|loop`)
  for (;;) {
    await tick()
    await new Promise(resolve => setTimeout(resolve, TICK_MS))
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const home = process.env.CREW_HOME
  if (!home) {
    console.error('lab-runner: CREW_HOME is not set')
    process.exit(2)
  }
  main(process.argv.slice(2), home).catch(error => {
    console.error(`lab-runner: ${error.message}`)
    process.exit(1)
  })
}
