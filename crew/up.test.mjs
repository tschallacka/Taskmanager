// crew up: each part is already running, started, or failed with a reason; nothing else. The commands are
// replaced by a fake runner, so no real service is touched. Run:
//   node --test crew/up.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { upParts } from './up.mjs'

// A fake runner: `up` says which commands succeed; every call is logged.
function fakeRunner(up, log) {
  return (command) => {
    log.push(command)
    const ok = up.has(command)
    return { ok, status: ok ? 0 : 1, stderr: ok ? '' : `fail: ${command}` }
  }
}

test('a part already running is left alone: no start command runs', () => {
  const log = []
  const result = upParts([{ name: 'dev copy', check: 'check-dev', start: 'start-dev' }], {
    runner: fakeRunner(new Set(['check-dev']), log),
    remove: () => {}
  })
  assert.deepEqual(result.lines, ['dev copy: already running'])
  assert.equal(result.ok, true)
  assert.deepEqual(log, ['check-dev'])
})

test('a part down is started, and its check passes again', () => {
  const log = []
  // The check fails before the start and passes after it: a fake that flips after the start command.
  let started = false
  const runner = (command) => {
    log.push(command)
    if (command === 'check-pia') return { ok: started, status: started ? 0 : 1, stderr: '' }
    if (command === 'start-pia') {
      started = true
      return { ok: true, status: 0, stderr: '' }
    }
    return { ok: false, status: 1, stderr: '' }
  }
  const result = upParts([{ name: 'Pia', check: 'check-pia', start: 'start-pia' }], { runner, remove: () => {} })
  assert.deepEqual(result.lines, ['Pia: started'])
  assert.equal(result.ok, true)
  assert.deepEqual(log, ['check-pia', 'start-pia', 'check-pia'])
})

test('a stale socket is removed before the start, and only when the part is down', () => {
  const removed = []
  let started = false
  const runner = (command) => {
    if (command === 'check') return { ok: started, status: started ? 0 : 1, stderr: '' }
    started = true
    return { ok: true, status: 0, stderr: '' }
  }
  upParts([{ name: 'Pia', check: 'check', start: 'start', staleSocket: '/run/sock' }], {
    runner,
    remove: p => removed.push(p)
  })
  assert.deepEqual(removed, ['/run/sock'])

  const removedAgain = []
  upParts([{ name: 'Pia', check: 'check', start: 'start', staleSocket: '/run/sock' }], {
    runner: fakeRunner(new Set(['check']), []),
    remove: p => removedAgain.push(p)
  })
  assert.deepEqual(removedAgain, [], 'a running part keeps its socket')
})

test('a failed start is reported with the reason, and the run is not ok', () => {
  const result = upParts([{ name: 'dev database', check: 'check-db', start: 'start-db' }], {
    runner: fakeRunner(new Set(), []),
    remove: () => {}
  })
  assert.equal(result.ok, false)
  assert.equal(result.lines[0], 'dev database: failed: fail: start-db')
})

test('a down part with no start command is a failure that says so, and the next part still runs', () => {
  const log = []
  const result = upParts([
    { name: 'Pia', check: 'check-pia' },
    { name: 'dev copy', check: 'check-dev', start: 'start-dev' }
  ], { runner: fakeRunner(new Set(['check-dev']), log), remove: () => {} })
  assert.equal(result.ok, false)
  assert.equal(result.lines[0], 'Pia: failed: not running, and no start command is set in crew.json')
  assert.equal(result.lines[1], 'dev copy: already running')
})
