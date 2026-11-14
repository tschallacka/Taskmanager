// The lab's queue (card mwdkxbr0thtrcnc7mbi, slice 1): samples of a branch, first in first out, one at a time.
// A sample is { id, branch, file?, repeat?, by, at }. `file` is one test file (repeat says how many times to run it alone);
// without a file the whole suite runs. The queue is CREW_HOME/lab/lab-queue.json, written under one lock file. The
// functions here are pure except the two file helpers at the bottom, so the tests need no process.
import fs from 'node:fs'
import { join } from 'node:path'
import { withLock, writeRegistry } from './port-registry.mjs'

export const QUEUE_LIMIT = 50
export const MAX_REPEAT = 20
export const MAX_ATTEMPTS = 2
const KEEP_FINISHED = 10

export function labDir(home) {
  return join(home, 'lab')
}

export function queueFile(home) {
  return join(labDir(home), 'lab-queue.json')
}

export function requestDir(home) {
  return join(labDir(home), 'requests')
}

/** Checks one sample request. Returns { ok, sample } with the normal form, or { ok: false, message }. */
export function validSample(input) {
  const branch = String(input?.branch ?? '')
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(branch) || branch.includes('..') || branch.endsWith('/')) {
    return { ok: false, message: `branch "${branch.slice(0, 80)}" is not a branch name` }
  }
  const file = input?.file == null || input.file === '' ? null : String(input.file)
  if (file !== null && (!/^tests\/[A-Za-z0-9._/-]+\.(ts|mjs)$/.test(file) || file.includes('..'))) {
    return { ok: false, message: `file "${file.slice(0, 120)}" must be one test file under tests/` }
  }
  const repeat = input?.repeat == null ? 1 : Number(input.repeat)
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > MAX_REPEAT) {
    return { ok: false, message: `repeat must be a whole number from 1 to ${MAX_REPEAT}` }
  }
  if (repeat > 1 && file === null) return { ok: false, message: 'repeat needs a file: the whole suite runs once' }
  return { ok: true, sample: { branch, file, repeat } }
}

export function emptyQueue() {
  return { jobs: [] }
}

/**
 * Adds a sample at the end. A branch that is already queued or running is refused: one sample per branch at a time.
 * Returns { ok, queue, position } or { ok: false, message }.
 */
export function enqueue(queue, sample, { id, by, now }) {
  const jobs = queue.jobs ?? []
  const live = jobs.find(j => (j.state === 'queued' || j.state === 'running') && j.branch === sample.branch)
  if (live) return { ok: false, message: `branch ${sample.branch} is already in the lab as ${live.id} (${live.state})` }
  const waiting = jobs.filter(j => j.state === 'queued').length
  if (waiting >= QUEUE_LIMIT) return { ok: false, message: `the lab queue is full (${QUEUE_LIMIT} waiting)` }
  const job = { id, branch: sample.branch, file: sample.file, repeat: sample.repeat, by, at: now, state: 'queued', attempts: 0 }
  return { ok: true, queue: { ...queue, jobs: [...jobs, job] }, position: waiting + 1 }
}

/** The job to run next: the first queued one, in the order they came. Null when nothing waits. */
export function nextJob(queue) {
  return (queue.jobs ?? []).find(j => j.state === 'queued') ?? null
}

export function markRunning(queue, id, now) {
  return { ...queue, jobs: queue.jobs.map(j => (j.id === id ? { ...j, state: 'running', started: now, attempts: j.attempts + 1 } : j)) }
}

/** Records the result of a run: state done when it passed, failed otherwise. Keeps only the last few finished jobs. */
export function finish(queue, id, result, now) {
  const jobs = queue.jobs.map(j => (j.id === id ? { ...j, state: result.status === 'pass' ? 'done' : 'failed', finished: now, result } : j))
  const finished = jobs.filter(j => j.state === 'done' || j.state === 'failed')
  const drop = new Set(finished.slice(0, Math.max(0, finished.length - KEEP_FINISHED)).map(j => j.id))
  return { ...queue, jobs: jobs.filter(j => !drop.has(j.id)) }
}

/** After a restart: a job that was running is queued again, once. A second crash is a failure, not a loop. */
export function requeueRunning(queue, now) {
  const jobs = queue.jobs.map(j => {
    if (j.state !== 'running') return j
    if (j.attempts < MAX_ATTEMPTS) return { ...j, state: 'queued', requeued: now }
    return { ...j, state: 'failed', finished: now, result: { status: 'fail', stage: 'crash', pass: 0, fail: 0 } }
  })
  return { ...queue, jobs }
}

/** Removes a queued sample by branch. A running one is not cancelled here: only Boss stops a running job. */
export function cancel(queue, branch) {
  const job = (queue.jobs ?? []).find(j => j.branch === branch && (j.state === 'queued' || j.state === 'running'))
  if (!job) return { ok: false, message: `no queued sample for ${branch}` }
  if (job.state === 'running') return { ok: false, message: `${branch} is running as ${job.id}; only Boss stops a running job` }
  return { ok: true, queue: { ...queue, jobs: queue.jobs.filter(j => j.id !== job.id) }, id: job.id }
}

/** The lines `crew <who> lab status` prints: the running job, the waiting ones with their position, the last finished. */
export function statusLines(queue) {
  const jobs = queue.jobs ?? []
  const lines = []
  const running = jobs.find(j => j.state === 'running')
  lines.push(running ? `running: ${running.branch} (${running.id}${running.file ? `, ${running.file} x${running.repeat}` : ''})` : 'running: none')
  let position = 0
  for (const j of jobs.filter(x => x.state === 'queued')) {
    position += 1
    lines.push(`queued ${position}: ${j.branch} (${j.id}, by ${j.by})${j.file ? ` ${j.file} x${j.repeat}` : ''}`)
  }
  if (position === 0) lines.push('queued: none')
  for (const j of jobs.filter(x => x.state === 'done' || x.state === 'failed').slice(-KEEP_FINISHED)) {
    const r = j.result ?? {}
    lines.push(`${j.state}: ${j.branch} (${j.id}) ${r.status ?? '?'} stage=${r.stage ?? '?'} pass=${r.pass ?? 0} fail=${r.fail ?? 0}`)
  }
  return lines
}

/**
 * The RESULT line of lab-run.sh, the last one in the text: `RESULT: pass|fail stage=<stage> pass=<n> fail=<n>`.
 * No RESULT line is a failure at stage no-result.
 */
export function parseResult(text) {
  const lines = String(text ?? '').split('\n').filter(l => l.startsWith('RESULT: '))
  const line = lines[lines.length - 1]
  if (!line) return { status: 'fail', stage: 'no-result', pass: 0, fail: 0 }
  const status = /^RESULT: pass\b/.test(line) ? 'pass' : 'fail'
  const field = name => {
    const m = new RegExp(`\\b${name}=([^\\s]+)`).exec(line)
    return m ? m[1] : null
  }
  const n = v => (v != null && /^\d+$/.test(v) ? Number(v) : 0)
  return { status, stage: field('stage') ?? 'unknown', pass: n(field('pass')), fail: n(field('fail')) }
}

// ── the files (the only impure part) ───────────────────────────────────────

export function readQueue(file) {
  try {
    const q = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (q && Array.isArray(q.jobs)) return q
  } catch {
    // no queue yet, or a broken one: start empty
  }
  return emptyQueue()
}

/**
 * Runs fn(queue) under the queue lock. fn returns { result, queue? }: when it returns a queue, it is written. Returns the
 * result. The lock is the same one the port registry uses (a lock file next to the queue, stale locks taken over).
 */
export function withQueue(home, fn) {
  const file = queueFile(home)
  fs.mkdirSync(labDir(home), { recursive: true })
  return withLock(file, () => {
    const out = fn(readQueue(file))
    if (out.queue) writeRegistry(file, out.queue)
    return out.result
  })
}
