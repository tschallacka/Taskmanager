// The Blocking list (server/utils/taskBlocking.ts): the inverse of Blocked by. Pure, so no database runs here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blockingOf, type BlockingTask } from '../server/utils/taskBlocking'

const terminal = new Set(['done'])
const task = (id: string, title: string, columnId: string, visibility: 'internal' | 'customer' = 'internal', deleted = false): BlockingTask =>
  ({ id, title, columnId, visibility, deleted })

const tasks = new Map<string, BlockingTask>([
  ['blocker', task('blocker', 'Worktree and ports', 'todo')],
  ['waitA', task('waitA', 'Lab on the worktree', 'todo')],
  ['waitB', task('waitB', 'Shots after the worktree', 'done')],
  ['waitC', task('waitC', 'Customer-visible follow-up', 'todo', 'customer')],
  ['gone', task('gone', 'Deleted waiter', 'todo', 'internal', true)]
])
const links = [
  { blockedTaskId: 'waitA', blockerTaskId: 'blocker' },
  { blockedTaskId: 'waitB', blockerTaskId: 'blocker' },
  { blockedTaskId: 'waitC', blockerTaskId: 'blocker' },
  { blockedTaskId: 'gone', blockerTaskId: 'blocker' },
  { blockedTaskId: 'blocker', blockerTaskId: 'waitA' }
]

test('the team sees every live task that waits for this one, with its title, its column state and no deleted ones', () => {
  const list = blockingOf({ taskId: 'blocker', links, tasks, terminalColumnIds: terminal, blockerFinished: false, audience: 'staff' })
  assert.deepEqual(list.waiting.map(w => w.id), ['waitC', 'waitA', 'waitB'], 'sorted by title (Customer, Lab, Shots), deleted tasks left out')
  assert.equal(list.waiting.find(w => w.id === 'waitB')?.finished, true, 'a waiting task in a finishing column is finished')
  assert.equal(list.waiting.find(w => w.id === 'waitA')?.finished, false)
  assert.equal(list.count, 3)
  assert.equal(list.hidden, 0)
})

test('the inverse only: a task that this one waits for is not in its Blocking list', () => {
  const other = blockingOf({ taskId: 'waitA', links, tasks, terminalColumnIds: terminal, blockerFinished: false, audience: 'staff' })
  assert.deepEqual(other.waiting.map(w => w.id), ['blocker'], 'waitA blocks the blocker, so the blocker waits for it')
})

test('a customer sees only the customer-visible waiting tasks, and the count of the rest', () => {
  const list = blockingOf({ taskId: 'blocker', links, tasks, terminalColumnIds: terminal, blockerFinished: false, audience: 'customer' })
  assert.deepEqual(list.waiting.map(w => w.id), ['waitC'])
  assert.equal(list.hidden, 2, 'two internal waiting tasks are counted, not named')
  assert.equal(list.count, 3)
})

test('an empty list when nothing waits, and no "free" flag without a waiting task', () => {
  const none = blockingOf({ taskId: 'waitB', links, tasks, terminalColumnIds: terminal, blockerFinished: true, audience: 'staff' })
  assert.deepEqual(none.waiting, [])
  assert.equal(none.count, 0)
  assert.equal(none.free, false, 'a finished task with nothing waiting is not "now free"')
})

test('when the blocker is finished, the waiting tasks are "now free" for as long as they wait', () => {
  const list = blockingOf({ taskId: 'blocker', links, tasks, terminalColumnIds: terminal, blockerFinished: true, audience: 'staff' })
  assert.equal(list.free, true)
})
