// The lab runner (crew/lab-runner.mjs) and the request command (crew/lab.mjs): requests are queued or rejected, a run takes
// the slot and releases it, a waiting slot runs nothing, a timeout is a failure, and the job script answers one RESULT line
// (dry mode). Fake slots and fake job runs; the one spawned process is the dry script, which runs no step.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { claimRunner, drainRequests, recoverAfterRestart, runOne, runJobScript } from './lab-runner.mjs'
import { main as labMain, parseSubmit, writeRequest } from './lab.mjs'
import { emptyQueue, enqueue, nextJob, parseResult, queueFile, readQueue, requestDir, withQueue } from './lab-queue.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const NOW = '2026-11-14T15:00:00.000Z'
const home = () => mkdtempSync(join(tmpdir(), 'lab-home-'))
const request = (dir, id, body) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${id}.json`), typeof body === 'string' ? body : JSON.stringify({ id, ...body }))
}
const fakeSlot = (granted, holder = null) => {
  const calls = { acquire: [], release: 0 }
  return {
    calls,
    acquire: purpose => {
      calls.acquire.push(purpose)
      return { granted, holder }
    },
    release: () => {
      calls.release += 1
    }
  }
}

test('a valid request is queued and moved to done; a bad one is rejected with its reason; a duplicate branch is rejected', () => {
  const h = home()
  const dir = requestDir(h)
  request(dir, 'lab-1', { branch: 'wade/a', by: 'wade' })
  request(dir, 'lab-2', { branch: '--evil', by: 'wade' })
  request(dir, 'lab-3', { branch: 'wade/a', by: 'wren' })
  request(dir, 'lab-4', '{ not json')
  const lines = drainRequests(h, { now: NOW })
  assert.deepEqual(lines, [
    'queued lab-1 at 1: wade/a',
    'rejected lab-2: branch "--evil" is not a branch name',
    'rejected lab-3: branch wade/a is already in the lab as lab-1 (queued)',
    'rejected lab-4: not JSON'
  ])
  assert.deepEqual(readQueue(queueFile(h)).jobs.map(j => j.id), ['lab-1'])
  assert.ok(existsSync(join(dir, 'done', 'lab-1.json')))
  assert.ok(existsSync(join(dir, 'rejected', 'lab-2.json.reason')))
  assert.equal(readdirSync(dir).filter(n => n.endsWith('.json')).length, 0, 'nothing is left to read twice')
})

test('one runner only: a second start is refused while the first one is alive; a dead one is taken over', () => {
  const h = home()
  claimRunner(h, 111, () => false)
  assert.equal(readFileSync(join(h, 'lab', 'runner.pid'), 'utf8').trim(), '111')
  assert.throws(() => claimRunner(h, 222, pid => pid === 111), /another lab runner is running \(pid 111\)/)
  assert.doesNotThrow(() => claimRunner(h, 222, () => false))
  assert.equal(readFileSync(join(h, 'lab', 'runner.pid'), 'utf8').trim(), '222')
})

test('no request folder is an empty answer, not an error', () => {
  assert.deepEqual(drainRequests(home(), { now: NOW }), [])
})

test('an idle queue runs nothing and takes no slot', async () => {
  const h = home()
  const slot = fakeSlot(true)
  const r = await runOne(h, { slot, runJob: () => assert.fail('nothing should run') })
  assert.deepEqual(r, { idle: true })
  assert.equal(slot.calls.acquire.length, 0)
})

test('a waiting slot runs nothing: the job stays queued and the holder is named', async () => {
  const h = home()
  withQueue(h, q => ({ result: null, queue: enqueue(q, { branch: 'wade/a', file: null, repeat: 1 }, { id: 'lab-1', by: 'wade', now: NOW }).queue }))
  const slot = fakeSlot(false, 'wick')
  const r = await runOne(h, { slot, runJob: () => assert.fail('the slot is not ours') })
  assert.deepEqual(r, { waiting: true, job: 'lab-1', holder: 'wick' })
  assert.equal(slot.calls.release, 0, 'nothing was granted, so nothing is released')
  assert.equal(nextJob(readQueue(queueFile(h))).id, 'lab-1', 'still first in line')
})

test('a granted run records its RESULT, writes result.json and the log, and releases the slot', async () => {
  const h = home()
  withQueue(h, q => ({ result: null, queue: enqueue(q, { branch: 'wade/a', file: null, repeat: 1 }, { id: 'lab-1', by: 'wade', now: NOW }).queue }))
  const slot = fakeSlot(true)
  const r = await runOne(h, {
    slot,
    now: () => NOW,
    runJob: async job => ({ stdout: `running ${job.branch}\nRESULT: pass stage=done pass=40 fail=0\n`, timedOut: false })
  })
  assert.equal(r.done, 'lab-1')
  assert.deepEqual(r.result, { status: 'pass', stage: 'done', pass: 40, fail: 0 })
  assert.equal(slot.calls.release, 1)
  const saved = JSON.parse(readFileSync(join(h, 'lab', 'lab-1', 'result.json'), 'utf8'))
  assert.equal(saved.branch, 'wade/a')
  assert.equal(saved.pass, 40)
  assert.equal(readQueue(queueFile(h)).jobs[0].state, 'done')
  assert.match(readFileSync(join(h, 'lab', 'lab-1', 'runner.log'), 'utf8'), /RESULT: pass/)
})

test('a run over its time is a failure at stage timeout, and the slot is still released', async () => {
  const h = home()
  withQueue(h, q => ({ result: null, queue: enqueue(q, { branch: 'wade/a', file: null, repeat: 1 }, { id: 'lab-1', by: 'wade', now: NOW }).queue }))
  const slot = fakeSlot(true)
  const r = await runOne(h, { slot, now: () => NOW, runJob: async () => ({ stdout: '', timedOut: true }) })
  assert.deepEqual(r.result, { status: 'fail', stage: 'timeout', pass: 0, fail: 0 })
  assert.equal(slot.calls.release, 1)
})

test('a run that throws releases the slot and leaves the job running, so a restart requeues it once', async () => {
  const h = home()
  withQueue(h, q => ({ result: null, queue: enqueue(q, { branch: 'wade/a', file: null, repeat: 1 }, { id: 'lab-1', by: 'wade', now: NOW }).queue }))
  const slot = fakeSlot(true)
  await assert.rejects(runOne(h, { slot, now: () => NOW, runJob: async () => { throw new Error('boom') } }), /boom/)
  assert.equal(slot.calls.release, 1)
  assert.equal(readQueue(queueFile(h)).jobs[0].state, 'running')
  recoverAfterRestart(h, NOW)
  assert.equal(readQueue(queueFile(h)).jobs[0].state, 'queued')
})

test('runJobScript collects the output of the job script and reports a timeout as timed out', async () => {
  const h = home()
  const script = join(h, 'fake-run.sh')
  writeFileSync(script, 'echo "RESULT: pass stage=done pass=2 fail=0"\n')
  const out = await runJobScript(h, { id: 'lab-1', branch: 'wade/a' }, { script })
  assert.equal(out.timedOut, false)
  assert.equal(parseResult(out.stdout).pass, 2)
  const slow = join(h, 'slow-run.sh')
  writeFileSync(slow, 'sleep 5\n')
  const late = await runJobScript(h, { id: 'lab-2', branch: 'wade/b' }, { script: slow, timeoutMs: 100 })
  assert.equal(late.timedOut, true)
})

test('the job script in dry mode answers one RESULT line and runs no step', () => {
  const h = home()
  const run = spawnSync('sh', [join(HERE, 'lab-run.sh'), 'lab-dry-1', 'wade/a'], { encoding: 'utf8', env: { ...process.env, CREW_HOME: h, LAB_DRY: '1' } })
  assert.equal(run.status, 0, run.stderr)
  const results = run.stdout.trim().split('\n').filter(l => l.startsWith('RESULT: '))
  assert.deepEqual(results, ['RESULT: pass stage=dry pass=0 fail=0'])
  assert.equal(parseResult(run.stdout).status, 'pass')
})

test('the job script refuses a run with no CREW_HOME', () => {
  const run = spawnSync('sh', [join(HERE, 'lab-run.sh'), 'lab-x', 'wade/a'], { encoding: 'utf8', env: { ...process.env, CREW_HOME: '' } })
  assert.notEqual(run.status, 0)
})

test('crew <who> lab submit: the branch and flags are parsed; a file and repeat come through; flags that are unknown are refused', () => {
  assert.deepEqual(parseSubmit(['wade/a']), { branch: 'wade/a', file: null, repeat: null })
  assert.deepEqual(parseSubmit(['wade/a', '--file', 'tests/office-scene.test.ts', '--repeat', '3']), { branch: 'wade/a', file: 'tests/office-scene.test.ts', repeat: '3' })
  assert.match(parseSubmit(['wade/a', '--fast']).error, /unknown flag/)
  assert.match(parseSubmit([]).error, /usage/)
})

test('lab submit writes one request file for the runner; a refused one writes nothing', () => {
  const h = home()
  const ok = labMain(['wade', 'submit', 'wade/a', '--file', 'tests/office-scene.test.ts', '--repeat', '2'], h, new Date(NOW))
  assert.equal(ok.code, 0)
  assert.match(ok.lines[0], /^request lab-\w+-\w+ written for wade\/a; the lab runner queues it$/)
  const files = readdirSync(requestDir(h))
  assert.equal(files.length, 1)
  const body = JSON.parse(readFileSync(join(requestDir(h), files[0]), 'utf8'))
  assert.deepEqual([body.branch, body.file, body.repeat, body.by], ['wade/a', 'tests/office-scene.test.ts', 2, 'wade'])
  const refused = labMain(['wade', 'submit', 'wade/a', '--repeat', '3'], h, new Date(NOW))
  assert.equal(refused.code, 65)
  assert.equal(readdirSync(requestDir(h)).length, 1, 'the refused request writes no file')
})

test('lab status and cancel read and write the queue: a submitted request is queued by the runner, then shown and cancelled', () => {
  const h = home()
  labMain(['wade', 'submit', 'wade/a'], h, new Date(NOW))
  drainRequests(h, { now: NOW })
  assert.match(labMain(['wade', 'status'], h).lines.join('\n'), /queued 1: wade\/a/)
  assert.match(labMain(['wade', 'cancel', 'wade/a'], h).lines[0], /^cancelled lab-/)
  assert.deepEqual(labMain(['wade', 'status'], h).lines, ['running: none', 'queued: none'])
  assert.equal(labMain(['wade', 'cancel', 'wade/a'], h).code, 1)
})

test('writeRequest makes the id and the file, and the file is the only one the runner reads', () => {
  const h = home()
  const id = writeRequest(h, { branch: 'wade/a', file: null, repeat: 1 }, { who: 'wade', now: new Date(NOW) })
  assert.ok(id.startsWith('lab-'))
  assert.ok(fs.existsSync(join(requestDir(h), `${id}.json`)))
  assert.equal(emptyQueue().jobs.length, 0)
  assert.ok(enqueue(emptyQueue(), { branch: 'x/y', file: null, repeat: 1 }, { id, by: 'wade', now: NOW }).ok)
})
