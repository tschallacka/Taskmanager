// crew dev-copies: which workers need a copy restarted, and what is done for each. The probe and the start are
// injected, so no real dev copy is touched. Run:
//   node --test crew/dev-copies.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { needingCopies, copyPlan } from './dev-copies.mjs'

const CONFIG = {
  wren: { port: 3101, worktree: '/w/wren' },
  wick: { port: 3102, worktree: '/w/wick' }
}

test('only a worker with a card in Verify UX or Verify QA needs a copy', () => {
  const briefs = [
    { who: 'wren', blocks: [{ column: 'Verify QA' }] },
    { who: 'wick', blocks: [{ column: 'In progress' }] },
    { who: 'wynn', blocks: [{ column: 'Verify UX' }, { column: 'To do' }] },
    { who: 'wade', blocks: [{ column: 'Verify PM' }] }
  ]
  assert.deepEqual(needingCopies(briefs), ['wren', 'wynn'])
})

test('a copy that already answers is left alone; one that is down is started and checked again', () => {
  const started = []
  let up = new Set([3101])
  const result = copyPlan(['wren', 'wick'], {
    config: CONFIG,
    probe: port => up.has(port),
    start: (who) => {
      started.push(who)
      up = new Set([...up, 3102])
      return { ok: true }
    }
  })
  assert.deepEqual(started, ['wick'])
  assert.deepEqual(result.lines, ['wren: already answering on :3101', 'wick: started on :3102'])
  assert.equal(result.ok, true)
})

test('a start that does not bring the copy up is a failure with its reason', () => {
  const result = copyPlan(['wick'], {
    config: CONFIG,
    probe: () => false,
    start: () => ({ ok: true })
  })
  assert.equal(result.ok, false)
  assert.equal(result.lines[0], 'wick: failed on :3102: it does not answer after the start')
})

test('a worker with no copy set in crew.json is reported, not guessed', () => {
  const result = copyPlan(['usher'], { config: CONFIG, probe: () => true, start: () => ({ ok: true }) })
  assert.equal(result.ok, false)
  assert.match(result.lines[0], /usher: not restarted: no dev copy/)
})
