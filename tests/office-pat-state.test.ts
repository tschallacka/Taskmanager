// Pat Precheck's state at a card: when she walks to it and checks, and what her five checks say about it.
// Pure: no board, no database, no renderer. Run: node --import tsx --test tests/office-pat-state.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checksOf, findingsOf, passes, patStateOf, verdictOf } from '../app/office/roles/pat'
import type { PatCard, PatUpdate } from '../app/office/roles/pat'

const T0 = Date.UTC(2026, 10, 7, 13, 0, 0)

function card(over: Partial<PatCard> = {}): PatCard {
  return { column: 'Verify PM', tags: [], minutesLogged: 0, attachments: 0, updates: [], ...over }
}

const update = (by: string, body: string, minutes = 0): PatUpdate => ({ by, body, at: T0 + minutes * 60_000 })

const GOOD_WORKER_UPDATE = [
  'Built the checklist. Acceptance criteria: all 3 met, see the lines below.',
  'Tests: 412 pass, 0 fail.',
  'Lint on my files: clean.'
].join('\n')

test('Pat walks to a card in Verify PM that has no verdict yet', () => {
  assert.equal(patStateOf(card()), 'check')
})

test('Pat has no state at a card outside Verify PM', () => {
  assert.equal(patStateOf(card({ column: 'To do' })), null)
  assert.equal(patStateOf(card({ column: 'Verify UX' })), null)
  assert.equal(patStateOf(card({ column: 'Done' })), null)
})

test('once she has posted a verdict, Pat has no state at the card', () => {
  const passed = card({ updates: [update('pat', 'PRECHECK: pass\n1. ...', 20)] })
  assert.equal(verdictOf(passed), 'pass')
  assert.equal(patStateOf(passed), null)
  const failed = card({ updates: [update('pat', 'PRECHECK: fail\n1. no time', 20)] })
  assert.equal(verdictOf(failed), 'fail')
  assert.equal(patStateOf(failed), null)
})

test('the latest verdict counts: a card sent back and checked again is checked again', () => {
  const again = card({ updates: [update('pat', 'PRECHECK: fail', 10), update('wick', 'fixed', 30)] })
  assert.equal(verdictOf(again), 'fail')
  assert.equal(patStateOf(again), 'check', 'a fail followed by a worker fix, back in Verify PM, is a new check')
})

test('a card with everything in place passes all five checks', () => {
  const ok = card({ minutesLogged: 35, updates: [update('wick', GOOD_WORKER_UPDATE)] })
  const checks = checksOf(ok)
  assert.deepEqual(checks, { criteria: true, time: true, tests: true, screenshot: true, lint: true })
  assert.equal(passes(checks), true)
  assert.deepEqual(findingsOf(checks), [])
})

test('no time logged fails the time check, and the finding says so', () => {
  const checks = checksOf(card({ minutesLogged: 0, updates: [update('wick', GOOD_WORKER_UPDATE)] }))
  assert.equal(checks.time, false)
  assert.equal(passes(checks), false)
  assert.deepEqual(findingsOf(checks), ['no time logged on the card'])
})

test('test output with a failure fails the tests check; passes with zero failures count', () => {
  const failing = checksOf(card({ minutesLogged: 10, updates: [update('wick', 'Tests: 410 pass, 2 fail.\nLint: clean.')] }))
  assert.equal(failing.tests, false)
  const none = checksOf(card({ minutesLogged: 10, updates: [update('wick', 'Tests were run.')] }))
  assert.equal(none.tests, false, 'no counts, no pass')
  const zero = checksOf(card({ minutesLogged: 10, updates: [update('wick', '12 pass, 0 fail')] }))
  assert.equal(zero.tests, true)
})

test('a change a person sees needs a screenshot; a change nobody sees does not', () => {
  const seen = checksOf(card({ tags: ['verify ux'], attachments: 0, minutesLogged: 10, updates: [update('wick', GOOD_WORKER_UPDATE)] }))
  assert.equal(seen.screenshot, false)
  const attached = checksOf(card({ tags: ['verify ux'], attachments: 1, minutesLogged: 10, updates: [update('wick', GOOD_WORKER_UPDATE)] }))
  assert.equal(attached.screenshot, true)
  const unseen = checksOf(card({ tags: ['verify cq'], attachments: 0, minutesLogged: 10, updates: [update('wick', GOOD_WORKER_UPDATE)] }))
  assert.equal(unseen.screenshot, true)
})

test('lint not reported clean in the update fails the lint check', () => {
  const checks = checksOf(card({ minutesLogged: 10, updates: [update('wick', 'Tests: 5 pass, 0 fail. Lint had 3 errors.')] }))
  assert.equal(checks.lint, false)
})

test('the findings name each check that does not hold, in order', () => {
  const checks = checksOf(card({ minutesLogged: 0, updates: [update('wick', 'nothing much')] }))
  assert.deepEqual(findingsOf(checks), [
    'acceptance criteria not shown as met',
    'no time logged on the card',
    'no test output with passes and zero failures',
    'no clean lint result in the update'
  ])
})
