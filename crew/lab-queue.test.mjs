// The lab's queue (crew/lab-queue.mjs): sample checks, first in first out, one sample per branch, the restart rule, cancel,
// the status lines, the RESULT line, and the file under its lock. Fake data and a temp folder only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs, { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  cancel, emptyQueue, enqueue, finish, markRunning, MAX_REPEAT, nextJob, parseResult, QUEUE_LIMIT, queueFile, readQueue, requeueRunning, statusLines,
  validSample, withQueue
} from './lab-queue.mjs'

const NOW = '2026-11-14T15:00:00.000Z'
const add = (q, branch, id, extra = {}) => {
  const r = enqueue(q, { branch, file: null, repeat: 1, ...extra }, { id, by: 'wade', now: NOW })
  assert.equal(r.ok, true, r.message)
  return r.queue
}

test('a sample is a branch, optionally one test file under tests/ and a repeat of 1 to 20 for that file', () => {
  assert.deepEqual(validSample({ branch: 'wade/mwx-lab' }), { ok: true, sample: { branch: 'wade/mwx-lab', file: null, repeat: 1 } })
  assert.deepEqual(validSample({ branch: 'wade/x', file: 'tests/office-scene.test.ts', repeat: 5 }).sample, { branch: 'wade/x', file: 'tests/office-scene.test.ts', repeat: 5 })
  assert.equal(validSample({ branch: '--upload-pack=x' }).ok, false, 'a branch that starts with a dash is refused')
  assert.equal(validSample({ branch: 'wade/../x' }).ok, false, 'a dot-dot branch is refused')
  assert.equal(validSample({ branch: 'wade/x', file: '../etc/passwd' }).ok, false, 'a file outside tests/ is refused')
  assert.equal(validSample({ branch: 'wade/x', file: 'tests/a b.ts' }).ok, false, 'a file name with a space is refused')
  assert.equal(validSample({ branch: 'wade/x', repeat: 3 }).ok, false, 'repeat without a file is refused')
  assert.equal(validSample({ branch: 'wade/x', file: 'tests/a.ts', repeat: MAX_REPEAT + 1 }).ok, false)
  assert.equal(validSample({ branch: 'wade/x', file: 'tests/a.ts', repeat: 0 }).ok, false)
})

test('samples run in the order they came: first in, first out, with the position given when queued', () => {
  let q = emptyQueue()
  const a = enqueue(q, { branch: 'wade/a', file: null, repeat: 1 }, { id: 'lab-1', by: 'wade', now: NOW })
  assert.equal(a.position, 1)
  q = add(a.queue, 'wren/b', 'lab-2')
  assert.equal(nextJob(q).id, 'lab-1')
  q = finish(markRunning(q, 'lab-1', NOW), 'lab-1', { status: 'pass', stage: 'done', pass: 3, fail: 0 }, NOW)
  assert.equal(nextJob(q).id, 'lab-2')
})

test('a branch already queued or running is refused: one sample per branch at a time', () => {
  let q = add(emptyQueue(), 'wade/a', 'lab-1')
  const again = enqueue(q, { branch: 'wade/a', file: null, repeat: 1 }, { id: 'lab-2', by: 'wade', now: NOW })
  assert.equal(again.ok, false)
  assert.match(again.message, /already in the lab as lab-1 \(queued\)/)
  q = markRunning(q, 'lab-1', NOW)
  assert.match(enqueue(q, { branch: 'wade/a', file: null, repeat: 1 }, { id: 'lab-3', by: 'wade', now: NOW }).message, /\(running\)/)
})

test('the queue is full at 50 waiting samples', () => {
  let q = emptyQueue()
  for (let i = 0; i < QUEUE_LIMIT; i += 1) q = add(q, `wade/b${i}`, `lab-${i}`)
  const r = enqueue(q, { branch: 'wade/one-more', file: null, repeat: 1 }, { id: 'lab-x', by: 'wade', now: NOW })
  assert.equal(r.ok, false)
  assert.match(r.message, /queue is full/)
})

test('after a restart a running sample is queued again once; a second crash is a failure at stage crash', () => {
  let q = markRunning(add(emptyQueue(), 'wade/a', 'lab-1'), 'lab-1', NOW)
  q = requeueRunning(q, NOW)
  assert.equal(q.jobs[0].state, 'queued')
  q = markRunning(q, 'lab-1', NOW)
  q = requeueRunning(q, NOW)
  assert.equal(q.jobs[0].state, 'failed')
  assert.equal(q.jobs[0].result.stage, 'crash')
})

test('cancel removes a queued sample only; a running one is refused, and an unknown branch says so', () => {
  let q = add(add(emptyQueue(), 'wade/a', 'lab-1'), 'wade/b', 'lab-2')
  const c = cancel(q, 'wade/b')
  assert.equal(c.ok, true)
  assert.deepEqual(c.queue.jobs.map(j => j.id), ['lab-1'])
  const running = markRunning(q, 'lab-1', NOW)
  assert.match(cancel(running, 'wade/a').message, /only Boss stops a running job/)
  assert.match(cancel(q, 'wade/zzz').message, /no queued sample for wade\/zzz/)
})

test('the status lines: the running sample, the waiting ones with their position, the last finished', () => {
  let q = add(add(add(emptyQueue(), 'wade/a', 'lab-1'), 'wade/b', 'lab-2'), 'wren/c', 'lab-3', { file: 'tests/x.test.ts', repeat: 4 })
  q = markRunning(q, 'lab-1', NOW)
  q = finish(q, 'lab-1', { status: 'pass', stage: 'done', pass: 9, fail: 0 }, NOW)
  const lines = statusLines(q)
  assert.equal(lines[0], 'running: none')
  assert.equal(lines[1], 'queued 1: wade/b (lab-2, by wade)')
  assert.equal(lines[2], 'queued 2: wren/c (lab-3, by wade) tests/x.test.ts x4')
  assert.equal(lines[3], 'done: wade/a (lab-1) pass stage=done pass=9 fail=0')
})

test('the RESULT line is read from the last RESULT line; no line is a failure at stage no-result', () => {
  assert.deepEqual(parseResult('blah\nRESULT: pass stage=done pass=812 fail=0\n'), { status: 'pass', stage: 'done', pass: 812, fail: 0 })
  assert.deepEqual(parseResult('RESULT: pass stage=done pass=1\nRESULT: fail stage=tests pass=3 fail=2\n'), { status: 'fail', stage: 'tests', pass: 3, fail: 2 })
  assert.deepEqual(parseResult('the run died'), { status: 'fail', stage: 'no-result', pass: 0, fail: 0 })
})

test('the queue file is written under its lock and read back; a broken file is an empty queue', () => {
  const home = mkdtempSync(join(tmpdir(), 'lab-q-'))
  assert.deepEqual(readQueue(queueFile(home)), emptyQueue(), 'no file yet')
  withQueue(home, q => ({ result: null, queue: add(q, 'wade/a', 'lab-1') }))
  assert.deepEqual(readQueue(queueFile(home)).jobs.map(j => j.branch), ['wade/a'])
  const id = withQueue(home, q => ({ result: nextJob(q).id }))
  assert.equal(id, 'lab-1')
  fs.writeFileSync(queueFile(home), '{ not json')
  assert.deepEqual(readQueue(queueFile(home)), emptyQueue())
})
