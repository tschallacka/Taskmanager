// The task panel's address: /projects/<id>, /projects/<id>/<task>, /projects/<id>/<task>/<comment>, and the query kept
// when the panel opens or closes. Pure: no database, no browser. Run:
//   node --import tsx --test tests/task-panel-url.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { queryWithoutTask, taskPanelPath } from '../app/utils/taskPanelUrl'

test('the board, the task and the comment are the three path forms', () => {
  assert.equal(taskPanelPath('p1'), '/projects/p1')
  assert.equal(taskPanelPath('p1', null), '/projects/p1')
  assert.equal(taskPanelPath('p1', 't1'), '/projects/p1/t1')
  assert.equal(taskPanelPath('p1', 't1', 'c9'), '/projects/p1/t1/c9')
})

test('ids are encoded, so a slash or a space cannot change the path', () => {
  assert.equal(taskPanelPath('a b', 'x/y'), '/projects/a%20b/x%2Fy')
  assert.equal(taskPanelPath('p1', 't1', 'c 2'), '/projects/p1/t1/c%202')
})

test('a comment without a task is not in the path', () => {
  assert.equal(taskPanelPath('p1', null, 'c9'), '/projects/p1')
})

test('the query keeps its view and filters, and drops only the old task parameter', () => {
  assert.deepEqual(queryWithoutTask({ view: 'list', task: 't1', q: 'x' }), { view: 'list', q: 'x' })
  assert.deepEqual(queryWithoutTask({ view: 'list' }), { view: 'list' })
  assert.deepEqual(queryWithoutTask({}), {})
})
