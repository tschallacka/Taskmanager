// The crew monitor's board rule (server/utils/boardStatus.ts): busy or idle from the board alone. Covers a card in
// progress, a card in a Verify column, an open subtask under someone else's working card, a done subtask, a subtask
// under a card that is not working, a finished card, and nothing at all. Pure, no database. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/crew-monitor.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boardStatusOf } from '../server/utils/boardStatus'
import type { MonitorTask } from '../server/utils/boardStatus'

const WREN = 'user-wren'
const PIA = 'user-pia'

function task(over: Partial<MonitorTask> & { id: string }): MonitorTask {
  return { title: over.id, stage: 'backlog', column: 'Backlog', assigneeId: null, parentTaskId: null, completed: false, ...over }
}

test('a card in progress makes its owner busy, and names the card and the column', () => {
  const tasks = [task({ id: 'c1', title: 'Build the lights', stage: 'doing', column: 'In progress', assigneeId: WREN })]
  assert.deepEqual(boardStatusOf(WREN, tasks), { state: 'busy', note: 'Busy: Build the lights in In progress' })
})

test('a card waiting in a Verify column makes its owner busy', () => {
  const tasks = [task({ id: 'c1', title: 'Review me', stage: 'verify-cq', column: 'Verify CQ', assigneeId: WREN })]
  assert.equal(boardStatusOf(WREN, tasks).state, 'busy')
})

test('an open subtask of theirs under someone else\'s working card makes them busy', () => {
  const tasks = [
    task({ id: 'parent', title: 'Pia\'s card', stage: 'doing', column: 'In progress', assigneeId: PIA }),
    task({ id: 'sub', title: 'Fix the test', stage: 'doing', column: 'In progress', assigneeId: WREN, parentTaskId: 'parent' })
  ]
  assert.deepEqual(boardStatusOf(WREN, tasks), { state: 'busy', note: 'Busy: subtask Fix the test under Pia\'s card' })
})

test('a done subtask does not count', () => {
  const tasks = [
    task({ id: 'parent', title: 'Card', stage: 'doing', column: 'In progress', assigneeId: PIA }),
    task({ id: 'sub', title: 'Done bit', stage: 'doing', column: 'In progress', assigneeId: WREN, parentTaskId: 'parent', completed: true })
  ]
  assert.deepEqual(boardStatusOf(WREN, tasks), { state: 'idle', note: '' })
})

test('a subtask under a card that is not in a working column does not count', () => {
  const tasks = [
    task({ id: 'parent', title: 'Waiting card', stage: 'todo', column: 'To do', assigneeId: PIA }),
    task({ id: 'sub', title: 'Later bit', stage: 'todo', column: 'To do', assigneeId: WREN, parentTaskId: 'parent' })
  ]
  assert.equal(boardStatusOf(WREN, tasks).state, 'idle')
})

test('a finished card in a working column does not make its owner busy', () => {
  const tasks = [task({ id: 'c1', title: 'Shipped', stage: 'doing', column: 'In progress', assigneeId: WREN, completed: true })]
  assert.equal(boardStatusOf(WREN, tasks).state, 'idle')
})

test('a person with nothing on the board is idle, with no note', () => {
  const tasks = [task({ id: 'c1', title: 'Someone else', stage: 'doing', column: 'In progress', assigneeId: PIA })]
  assert.deepEqual(boardStatusOf(WREN, tasks), { state: 'idle', note: '' })
  assert.deepEqual(boardStatusOf(WREN, []), { state: 'idle', note: '' })
})

test('a card in a working column that is not theirs changes nothing for them', () => {
  const tasks = [task({ id: 'c1', title: 'Pia\'s', stage: 'verify-pm', column: 'Verify PM', assigneeId: PIA })]
  assert.equal(boardStatusOf(WREN, tasks).state, 'idle')
  assert.equal(boardStatusOf(PIA, tasks).state, 'busy')
})

test('a card tagged in progress makes its owner busy, whatever its column', () => {
  const tasks = [task({ id: 'c1', title: 'Tagged', stage: 'backlog', column: 'To do', assigneeId: WREN, tags: ['in progress'] })]
  assert.deepEqual(boardStatusOf(WREN, tasks), { state: 'busy', note: 'Busy: Tagged in To do' })
})

test('an untagged card in a non-working column still does not count', () => {
  const tasks = [task({ id: 'c1', title: 'Plain', stage: 'backlog', column: 'To do', assigneeId: WREN, tags: ['bug'] })]
  assert.equal(boardStatusOf(WREN, tasks).state, 'idle')
})

test('a finished card tagged in progress does not make its owner busy', () => {
  const tasks = [task({ id: 'c1', title: 'Done', stage: 'backlog', column: 'Done', assigneeId: WREN, completed: true, tags: ['in progress'] })]
  assert.equal(boardStatusOf(WREN, tasks).state, 'idle')
})

test('an open subtask under a card tagged in progress makes its owner busy', () => {
  const tasks = [
    task({ id: 'p1', title: 'Parent', stage: 'backlog', column: 'To do', assigneeId: PIA, tags: ['in progress'] }),
    task({ id: 's1', title: 'Child', stage: 'backlog', column: 'To do', assigneeId: WREN, parentTaskId: 'p1' })
  ]
  assert.deepEqual(boardStatusOf(WREN, tasks), { state: 'busy', note: 'Busy: subtask Child under Parent' })
})
