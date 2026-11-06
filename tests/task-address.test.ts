// A task's address is /projects/<board-id>/<task-id>. The address bar, Copy link and a pasted link must agree,
// and the server reads a pasted link to the same ids. Pure functions, no browser. Run:
//   node --import tsx --test tests/task-address.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MISSING_TASK_NOTE, parseTaskAddress, taskAddress } from '../shared/utils/taskAddress'
import { idFromReference } from '../server/utils/mcpToolKit'

const origin = 'https://tasks.example.test'

test('a task address names the board and the task in that order', () => {
  assert.equal(taskAddress('b1', 't9'), '/projects/b1/t9')
  assert.deepEqual(parseTaskAddress('/projects/b1/t9'), { boardId: 'b1', taskId: 't9' })
})

test('ids are encoded in the address and decoded when read back', () => {
  const address = taskAddress('board a', 'task/9')
  assert.equal(address, '/projects/board%20a/task%2F9')
  assert.deepEqual(parseTaskAddress(address), { boardId: 'board a', taskId: 'task/9' })
})

test('other paths are not task addresses', () => {
  assert.equal(parseTaskAddress('/projects/b1'), null)
  assert.equal(parseTaskAddress('/projects/b1/t9/extra'), null)
  assert.equal(parseTaskAddress('/projects'), null)
})

test('the copied link and the address bar agree: a pasted task address opens the same task', () => {
  const copied = `${origin}${taskAddress('b1', 't9')}`
  assert.equal(idFromReference(copied, 'task'), 't9')
  assert.equal(idFromReference(copied, 'page'), 'b1')
})

test('an old ?task= link still names its task and its board', () => {
  assert.equal(idFromReference('/projects/b1?task=t9', 'task'), 't9')
  assert.equal(idFromReference('/projects/b1?task=t9', 'page'), 'b1')
})

test('a link to a board without a task names the board', () => {
  assert.equal(idFromReference('/projects/b1', 'task'), 'b1')
  assert.equal(idFromReference(`${origin}/projects/b1`, 'page'), 'b1')
})

test('text that is not a link is used as it is', () => {
  assert.equal(idFromReference('Q1/Q2 roadmap', 'page'), 'Q1/Q2 roadmap')
})

test('the missing-task note reads as the spec says', () => {
  assert.equal(MISSING_TASK_NOTE, 'This task is not on this board, or you cannot see it.')
})
