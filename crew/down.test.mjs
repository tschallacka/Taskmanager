// `crew down` with fakes (no real claude, no real tmux, no mail): a part stops only after its person's own confirmation with
// the same request id; a part not confirmed is left running unless --force; parts go down in reverse order; the wrap-up
// text is in the request. Run: node --test crew/down.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { downParts, wrapUpText } from './down.mjs'

function fakeRunner(log, failing = []) {
  return (command) => {
    log.push(command)
    return failing.includes(command) ? { ok: false, status: 1, stderr: 'boom' } : { ok: true, status: 0, stderr: '' }
  }
}

const parts = [
  { name: 'dev database', stop: 'stop-db' },
  { name: 'dev copy', stop: 'stop-copy' },
  { name: 'Pia', person: 'pia', stop: 'stop-pia' }
]

test('a part stops only after its person confirms with the same request id; no-person parts stop directly', async () => {
  const asked = []
  const commands = []
  const result = await downParts(parts, {
    ask: async (person, id, text) => asked.push({ person, id, text }),
    waitFor: async (person, id) => person === 'pia' && id === asked[0]?.id,
    runner: fakeRunner(commands),
    newId: () => 'req-1'
  })
  assert.equal(result.ok, true)
  assert.deepEqual(commands, ['stop-pia', 'stop-copy', 'stop-db'], 'reverse order: Pia, then the copy, then the database')
  assert.equal(asked[0].id, 'req-1')
  assert.match(asked[0].text, /crew down request req-1 for pia/)
  assert.deepEqual(result.lines, ['Pia: stopped', 'dev copy: stopped', 'dev database: stopped'])
})

test('a person who does not confirm by the timeout leaves the part running, and crew down reports it', async () => {
  const commands = []
  const result = await downParts(parts, { ask: async () => {}, waitFor: async () => false, runner: fakeRunner(commands), newId: () => 'req-2' })
  assert.equal(result.ok, false)
  assert.ok(!commands.includes('stop-pia'), 'Pia is not stopped without her confirmation')
  assert.match(result.lines[0], /^Pia: not confirmed by pia within the timeout; left running/)
})

test('--force stops an unconfirmed part and says so', async () => {
  const commands = []
  const result = await downParts(parts, { ask: async () => {}, waitFor: async () => false, runner: fakeRunner(commands), force: true, newId: () => 'req-3' })
  assert.ok(commands.includes('stop-pia'))
  assert.equal(result.lines[0], 'Pia: stopped (forced, not confirmed)')
})

test('the wrap-up text names the person, the request id and the down ok line', () => {
  const text = wrapUpText('wren', 'abc')
  assert.match(text, /crew down request abc for wren/)
  assert.match(text, /crew down ok: wren; stopped; <N> unread kept; request abc; at <time>/)
})

test('a failing stop is reported on its line and the result is not ok', async () => {
  const result = await downParts([{ name: 'dev copy', stop: 'bad' }], { runner: fakeRunner([], ['bad']) })
  assert.equal(result.ok, false)
  assert.equal(result.lines[0], 'dev copy: failed to stop: boom')
})
