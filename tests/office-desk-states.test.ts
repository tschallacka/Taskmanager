// deskStatesOf: what each person of the office cast is doing, from the same placement the office
// draws. Pure, so each state is pinned here without a database. Run:
//   node --import tsx --test tests/office-desk-states.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deskStatesOf, type OfficePerson, type OfficeSnapshot, type OfficeTask, type Stage } from '../shared/office/model'

const cast: OfficePerson[] = [
  { userId: 'u-pia', key: 'pia', name: 'Pia Planner', role: 'pm' },
  { userId: 'u-wren', key: 'wren', name: 'Wren Worker', role: 'worker' },
  { userId: 'u-wick', key: 'wick', name: 'Wick Worker', role: 'worker' },
  { userId: 'u-usher', key: 'usher', name: 'Usher Xander', role: 'ux' }
]

function task(id: string, stage: Stage, assigneeId: string | null): OfficeTask {
  return { id, title: `Card ${id}`, stage, column: stage, assigneeId, completed: false, blocked: false, comments: 0 }
}

function snapshot(tasks: OfficeTask[]): OfficeSnapshot {
  return { boardId: 'b1', boardName: 'Board', crewName: 'Crew', cast, tasks }
}

function stateOf(states: ReturnType<typeof deskStatesOf>, key: string) {
  const found = states.find(s => s.key === key)
  assert.ok(found, `${key} is in the cast`)
  return found
}

test('a worker with a card in progress is working, with that card', () => {
  const wren = stateOf(deskStatesOf(snapshot([task('t1', 'doing', 'u-wren')])), 'wren')
  assert.equal(wren.state, 'working')
  assert.deepEqual(wren.cards, [{ id: 't1', title: 'Card t1' }])
})

test('a worker with cards only in the To do column is queued', () => {
  const wren = stateOf(deskStatesOf(snapshot([task('t2', 'todo', 'u-wren')])), 'wren')
  assert.equal(wren.state, 'queued')
  assert.deepEqual(wren.cards.map(c => c.id), ['t2'])
})

test('a reviewer with a card in their gate is reviewing, and one without is idle', () => {
  const states = deskStatesOf(snapshot([task('t3', 'verify-ux', 'u-wren')]))
  assert.equal(stateOf(states, 'usher').state, 'reviewing')
  assert.deepEqual(stateOf(states, 'usher').cards.map(c => c.id), ['t3'])
  assert.equal(stateOf(deskStatesOf(snapshot([])), 'usher').state, 'idle')
})

test('a worker whose only card is in a review gate is idle, and the gate is named', () => {
  const wren = stateOf(deskStatesOf(snapshot([task('t4', 'verify-ux', 'u-wren')])), 'wren')
  assert.equal(wren.state, 'idle')
  assert.deepEqual(wren.cards, [])
  assert.deepEqual(wren.waitingOn, ['UX'])
})

test('a worker with nothing at all is idle with no gate to name', () => {
  const wick = stateOf(deskStatesOf(snapshot([task('t5', 'done', 'u-wren')])), 'wick')
  assert.equal(wick.state, 'idle')
  assert.deepEqual(wick.waitingOn, [])
})

test('a card assigned to someone outside the crew sits in Pia\'s backlog, and no worker is busy with it', () => {
  const states = deskStatesOf(snapshot([task('t6', 'doing', 'u-stranger')]))
  assert.equal(stateOf(states, 'wren').state, 'idle')
  assert.equal(stateOf(states, 'wick').state, 'idle')
  // Pia's own Backlog holds it, so she is queued, not idle; no worker is.
  assert.equal(stateOf(states, 'pia').state, 'queued')
})

test('a worker with a card in progress and another in a gate is working, and both gates and desk are read', () => {
  const wren = stateOf(deskStatesOf(snapshot([task('t7', 'doing', 'u-wren'), task('t8', 'verify-cq', 'u-wren')])), 'wren')
  assert.equal(wren.state, 'working')
  assert.deepEqual(wren.waitingOn, ['CQ'])
})

test('Pia with cards in Backlog is queued, with a card in her Verify column is reviewing, and with neither is idle', () => {
  assert.equal(stateOf(deskStatesOf(snapshot([task('t9', 'backlog', null)])), 'pia').state, 'queued')
  assert.equal(stateOf(deskStatesOf(snapshot([task('t10', 'verify-pm', null)])), 'pia').state, 'reviewing')
  assert.equal(stateOf(deskStatesOf(snapshot([])), 'pia').state, 'idle')
})
