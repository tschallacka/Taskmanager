// The request command (crew/lab.mjs) end to end, and the job script (crew/lab-run.sh) in dry mode: parseSubmit cases, a
// submit that the runner queues, the RESULT line read back from a real dry run, and a dry run refused for a bad id. No
// test is run and no step runs: the script's dry mode answers at once.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { main as labMain, parseSubmit } from './lab.mjs'
import { drainRequests } from './lab-runner.mjs'
import { parseResult, queueFile, readQueue, requestDir } from './lab-queue.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const NOW = new Date('2026-11-14T18:00:00.000Z')
const home = () => mkdtempSync(join(tmpdir(), 'lab-cmd-'))

test('parseSubmit: a branch alone; a branch with --file and --repeat; an unknown flag, a second branch and no branch are refused', () => {
  assert.deepEqual(parseSubmit(['wade/a']), { branch: 'wade/a', file: null, repeat: null })
  assert.deepEqual(parseSubmit(['wade/a', '--file', 'tests/x.test.ts', '--repeat', '3']), { branch: 'wade/a', file: 'tests/x.test.ts', repeat: '3' })
  assert.deepEqual(parseSubmit(['--file', 'tests/x.test.ts', 'wade/a']), { branch: 'wade/a', file: 'tests/x.test.ts', repeat: null }, 'flags may come first')
  assert.match(parseSubmit(['wade/a', '--fast']).error, /unknown flag --fast/)
  assert.match(parseSubmit(['wade/a', 'wade/b']).error, /one branch only/)
  assert.match(parseSubmit(['--repeat']).error, /usage/)
  assert.match(parseSubmit([]).error, /usage/)
})

test('a submit becomes a request the runner queues: the status shows it, with the id the command gave', () => {
  const h = home()
  const sub = labMain(['wade', 'submit', 'wade/a', '--file', 'tests/office-scene.test.ts', '--repeat', '2'], h, NOW)
  assert.equal(sub.code, 0)
  const id = /^request (lab-\S+) written/.exec(sub.lines[0])[1]
  assert.match(id, /^lab-[0-9a-z]+-[0-9a-f]{6}$/, 'the id is a sample id, so the runner accepts it')
  const drained = drainRequests(h, { now: NOW.toISOString() })
  assert.deepEqual(drained, [`queued ${id} at 1: wade/a`])
  assert.equal(readQueue(queueFile(h)).jobs[0].file, 'tests/office-scene.test.ts')
  assert.match(labMain(['wade', 'status'], h).lines.join('\n'), /queued 1: wade\/a \(lab-\S+, by wade\) tests\/office-scene\.test\.ts x2/)
})

test('a submit with a refused flag writes no request, so the runner has nothing to read', () => {
  const h = home()
  assert.equal(labMain(['wade', 'submit', 'wade/a', '--repeat', '2'], h, NOW).code, 65, 'repeat without a file')
  assert.equal(labMain(['wade', 'submit', '--bogus', 'wade/a'], h, NOW).code, 64)
  assert.equal(existsSync(requestDir(h)), false, 'nothing was written')
})

test('the RESULT line of a real dry run of lab-run.sh reads back as a pass at stage dry', () => {
  const h = home()
  const run = spawnSync('sh', [join(HERE, 'lab-run.sh'), 'lab-dry-abcdef', 'wade/a'], { encoding: 'utf8', env: { ...process.env, CREW_HOME: h, LAB_DRY: '1' } })
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(parseResult(run.stdout), { status: 'pass', stage: 'dry', pass: 0, fail: 0 })
  assert.equal(run.stdout.split('\n').filter(l => l.startsWith('RESULT: ')).length, 1, 'exactly one RESULT line')
})

test('a dry run with a file and a repeat still answers one RESULT line, at stage dry', () => {
  const h = home()
  const run = spawnSync('sh', [join(HERE, 'lab-run.sh'), 'lab-dry-abcdef', 'wade/a', 'tests/x.test.ts', '2'], { encoding: 'utf8', env: { ...process.env, CREW_HOME: h, LAB_DRY: '1' } })
  assert.equal(run.status, 0, run.stderr)
  assert.equal(parseResult(run.stdout).stage, 'dry')
})

test('a dry run for a bad id writes no folder and answers fail at stage id', () => {
  const h = home()
  const run = spawnSync('sh', [join(HERE, 'lab-run.sh'), 'lab-../../x', 'wade/a'], { encoding: 'utf8', env: { ...process.env, CREW_HOME: h, LAB_DRY: '1' } })
  assert.equal(parseResult(run.stdout).stage, 'id')
  assert.equal(parseResult(run.stdout).status, 'fail')
  assert.equal(existsSync(join(h, 'lab')), false)
  assert.equal(readdirSync(h).length, 0)
})
