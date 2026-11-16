// Susy daemon, phase 2 (card mwf201blsqvx3jczev): a card that enters a review gate wakes the gate's owner at once.
// Fake boards only: no network, no mail. Run: node --test crew/susy-gate-wakes.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gateWakes, headOf, GATE_TAGS, planGateRound, settleGateMail } from './susy-gate-wakes.mjs'

const card = (id, column, extra = {}) => ({
  id,
  title: `card ${id}`,
  column,
  assignee: 'Wade Worker',
  tags: [],
  updates: [],
  updatedAt: '2026-11-16T10:00:00.000Z',
  ...extra
})

test('the first round only records the columns: no wake without a previous state', () => {
  const out = gateWakes([card('a', 'Verify CQ')], undefined)
  assert.deepEqual(out.wakes, [])
  assert.deepEqual(out.columns, { a: 'Verify CQ' })
})

test('a card that enters a gate wakes that gate owner once', () => {
  const out = gateWakes([card('a', 'Verify CQ')], { a: 'In progress' })
  assert.equal(out.wakes.length, 1)
  assert.equal(out.wakes[0].to, 'nina')
  assert.equal(out.wakes[0].cardId, 'a')
  assert.equal(out.wakes[0].column, 'Verify CQ')
  assert.equal(out.wakes[0].tag, 'CQ approved')
})

test('a card that stays in its gate makes no wake', () => {
  const out = gateWakes([card('a', 'Verify CQ')], { a: 'Verify CQ' })
  assert.deepEqual(out.wakes, [])
})

test('a card that leaves a gate makes no wake', () => {
  assert.deepEqual(gateWakes([card('a', 'Done')], { a: 'Verify CQ' }).wakes, [])
  assert.deepEqual(gateWakes([card('a', 'To do')], { a: 'Verify PM' }).wakes, [])
})

test('a move into a column that is not a gate makes no wake', () => {
  assert.deepEqual(gateWakes([card('a', 'In progress')], { a: 'To do' }).wakes, [])
})

test('each gate names its owner and its tag', () => {
  const cases = [['Verify PM', 'pia', 'PM approved'], ['Verify UX', 'usher', 'UX approved'], ['Verify CQ', 'nina', 'CQ approved'], ['Verify QA', 'quincy', 'QA approved']]
  for (const [column, to, tag] of cases) {
    const out = gateWakes([card('a', column)], { a: 'In progress' })
    assert.equal(out.wakes[0].to, to, column)
    assert.equal(out.wakes[0].tag, tag, column)
    assert.equal(GATE_TAGS[column], tag)
  }
})

test('a re-entry after leaving wakes again, with a new key', () => {
  const first = gateWakes([card('a', 'Verify QA', { updatedAt: '2026-11-16T10:00:00.000Z' })], { a: 'In progress' })
  const back = gateWakes([card('a', 'To do')], { a: 'Verify QA' })
  const again = gateWakes([card('a', 'Verify QA', { updatedAt: '2026-11-16T11:00:00.000Z' })], back.columns)
  assert.equal(again.wakes.length, 1)
  assert.notEqual(again.wakes[0].key, first.wakes[0].key)
})

test('the key is the same for the same entry, so a wake is not repeated while the card stays put', () => {
  const one = gateWakes([card('a', 'Verify UX')], { a: 'In progress' })
  const two = gateWakes([card('a', 'Verify UX')], { a: 'In progress' })
  assert.equal(one.wakes[0].key, two.wakes[0].key)
})

test('the head is the last head a worker names on the card, else not stated', () => {
  const withHead = card('a', 'Verify CQ', { updates: [
    { author: 'crew wade (agent)', body: 'Wade: head d01e2a8, tests pass', at: '2026-11-16T09:00:00.000Z' },
    { author: 'crew wade (agent)', body: 'Wade: fixed it. Head is ba0a05f now.', at: '2026-11-16T09:30:00.000Z' }
  ] })
  assert.equal(headOf(withHead), 'ba0a05f')
  assert.equal(headOf(card('b', 'Verify CQ')), null)
  const out = gateWakes([withHead], { a: 'In progress' })
  assert.match(out.wakes[0].text, /Head: ba0a05f\./)
  const none = gateWakes([card('b', 'Verify CQ')], { b: 'In progress' })
  assert.match(none.wakes[0].text, /Head: not stated on the card\./)
})

test('the mail says what the card is, where it entered, and the one thing to do', () => {
  const out = gateWakes([card('a', 'Verify CQ', { title: 'Popup fix' })], { a: 'In progress' })
  const text = out.wakes[0].text
  assert.match(text, /Popup fix/)
  assert.match(text, /Verify CQ/)
  assert.match(text, /CQ approved/)
})

// ---- the round: what the daemon does with the wakes (dry-run logs; live mails once per wake, kill switch) ----

test('dry-run logs each wake and mails nothing', () => {
  const r1 = planGateRound({ cards: [card('a', 'In progress')], state: {}, live: false, enabled: true })
  const r2 = planGateRound({ cards: [card('a', 'Verify CQ')], state: { columns: r1.columns }, live: false, enabled: true })
  assert.deepEqual(r2.mails, [])
  assert.deepEqual(r2.owed, [])
  assert.equal(r2.lines.length, 1)
  assert.match(r2.lines[0], /^would mail nina: /)
})

test('live with the switch on: the wake is mailed to its owner, and kept until the mail is settled', () => {
  const r1 = planGateRound({ cards: [card('a', 'In progress')], state: {}, live: true, enabled: true })
  const r2 = planGateRound({ cards: [card('a', 'Verify CQ')], state: { columns: r1.columns }, live: true, enabled: true })
  assert.equal(r2.mails.length, 1)
  assert.equal(r2.mails[0].to, 'nina')
  assert.equal(r2.owed.length, 1)
  const settled = settleGateMail({ columns: r2.columns, owed: r2.owed }, r2.mails[0].key)
  assert.deepEqual(settled.owed, [])
})

test('a failed mail is not settled: the next round mails it again, with no card change', () => {
  const r1 = planGateRound({ cards: [card('a', 'In progress')], state: {}, live: true, enabled: true })
  const r2 = planGateRound({ cards: [card('a', 'Verify CQ')], state: { columns: r1.columns }, live: true, enabled: true })
  const r3 = planGateRound({ cards: [card('a', 'Verify CQ')], state: { columns: r2.columns, owed: r2.owed }, live: true, enabled: true })
  assert.equal(r3.mails.length, 1)
  assert.equal(r3.mails[0].key, r2.mails[0].key)
})

test('live with the switch off: no mail, and a line says the switch is off', () => {
  const r1 = planGateRound({ cards: [card('a', 'In progress')], state: {}, live: true, enabled: false })
  const r2 = planGateRound({ cards: [card('a', 'Verify CQ')], state: { columns: r1.columns }, live: true, enabled: false })
  assert.deepEqual(r2.mails, [])
  assert.deepEqual(r2.owed, [])
  assert.match(r2.lines[0], /gate wake off \(susy\.dispatch\.gateWakes is not true\)/)
})

test('a board that was not read (no cards) leaves the recorded columns alone', () => {
  const out = planGateRound({ cards: undefined, state: { columns: { a: 'In progress' } }, live: true, enabled: true })
  assert.deepEqual(out.columns, { a: 'In progress' })
  assert.deepEqual(out.mails, [])
})
