// The Blocking section wired end to end (source level, as the other shell and connect tests are): the route and its
// access check, the service query, the MCP get_task field, the read-only panel section, and where the drawer mounts it.
// The rules themselves are in tests/task-blocking.test.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('GET /api/tasks/:id/blocking uses the same access check as the blockers route, and answers the inverse list', () => {
  const route = read('server/api/tasks/[id]/blocking/index.get.ts')
  assert.match(route, /requireTask\(event, id\)/, 'the same task access as blockers')
  assert.match(route, /blockingFor\(task\.id, task\.projectId, viewer, task\.columnId/)
  assert.match(route, /audience: project\.audience|audience: project\.audience/, 'the viewer audience comes from the project')
})

test('the service query reads the same link rows backwards, without a schema change', () => {
  const service = read('server/utils/taskDependencyService.ts')
  const fn = service.slice(service.indexOf('export async function blockingFor('), service.indexOf('export async function blockingFor(') + 1400)
  assert.match(fn, /eq\(taskDependencies\.blockerTaskId, taskId\)/, 'the waiting tasks are the ones whose blocker is this task')
  assert.match(fn, /blockingOf\(\{/, 'the rules come from taskBlocking.ts')
  assert.match(fn, /isFinishedTask\(\{ columnId, completedAt, deletedAt \}, finishedColumns\)/, 'a finished blocker is the same test as the progress count')
})

test('get_task shows blocking next to blockers, only when something waits', () => {
  const tools = read('server/utils/mcpBoardTools.ts')
  assert.match(tools, /const blocking = await blockingFor\(task\.id, task\.projectId, \{ userId: context\.userId, audience \}/)
  assert.match(tools, /\.\.\.\(blocking\.count \? \{ blocking \} : \{\}\)/)
})

test('the panel section is read-only, names where to add and remove, and opens a waiting task in the drawer', () => {
  const panel = read('app/components/kanban/TaskBlocking.vue')
  assert.match(panel, /Add and remove these in the waiting task's own Blocked by\./)
  assert.match(panel, /Nothing waits for this task\./)
  assert.match(panel, /navigateTo\(\{ query: \{ \.\.\.route\.query, task: taskId \} \}\)/)
  assert.doesNotMatch(panel, /method: 'POST'|method: 'DELETE'|method: 'PUT'/, 'no writes from the Blocking section')
})

test('the task drawer mounts the Blocking section right after Blocked by', () => {
  const drawer = read('app/components/kanban/TaskDrawer.vue')
  const blockedBy = drawer.indexOf('<KanbanTaskBlockers')
  const blocking = drawer.indexOf('<KanbanTaskBlocking')
  assert.ok(blockedBy > 0 && blocking > blockedBy, 'Blocking comes after Blocked by')
})
