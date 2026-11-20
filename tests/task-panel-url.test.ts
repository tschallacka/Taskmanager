// The task panel's address: /projects/<id>, /projects/<id>/<task>, /projects/<id>/<task>/<comment>, and the query kept
// when the panel opens or closes. Pure: no database, no browser. Run:
//   node --import tsx --test tests/task-panel-url.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { activityStartsOpen, queryWithoutTask, taskPanelPath, taskQueryAsPanelAddress } from '../app/utils/taskPanelUrl'

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

test('a comment in the address opens the phone Activity sheet; without one it stays closed', () => {
  assert.equal(activityStartsOpen('c9'), true)
  assert.equal(activityStartsOpen(''), false)
  assert.equal(activityStartsOpen(undefined), false)
  assert.equal(activityStartsOpen(['c9']), false)
})

test('the task panel starts its Activity sheet from the permalink, so the comment window is on screen at phone width', () => {
  const drawer = readFileSync(new URL('../app/components/kanban/TaskDrawer.vue', import.meta.url), 'utf8')
  assert.match(drawer, /ref\(activityStartsOpen\(route\.params\.comment\)\)/)
  assert.match(drawer, /watch\(\(\) => route\.params\.comment/)
})

test('the query keeps its view and filters, and drops only the old task parameter', () => {
  assert.deepEqual(queryWithoutTask({ view: 'list', task: 't1', q: 'x' }), { view: 'list', q: 'x' })
  assert.deepEqual(queryWithoutTask({ view: 'list' }), { view: 'list' })
  assert.deepEqual(queryWithoutTask({}), {})
})

test('the old form ?task=&comment= becomes the path form /projects/<pid>/<task>/<comment>, never ?comment=', () => {
  assert.deepEqual(taskQueryAsPanelAddress('p1', { task: 't1', comment: 'c9' }), {
    path: '/projects/p1/t1/c9',
    query: {}
  })
  assert.doesNotMatch(taskQueryAsPanelAddress('p1', { task: 't1', comment: 'c9' })?.path ?? '', /\?/)
})

test('the rewrite keeps the other query parameters, and drops only the task', () => {
  assert.deepEqual(taskQueryAsPanelAddress('p1', { view: 'list', task: 't1', q: 'x' }), {
    path: '/projects/p1/t1',
    query: { view: 'list', q: 'x' }
  })
})

test('a query with no task is not rewritten, and a comment alone is not a panel address', () => {
  assert.equal(taskQueryAsPanelAddress('p1', { comment: 'c9' }), null)
  assert.equal(taskQueryAsPanelAddress('p1', {}), null)
})

// Criterion 2 of card mwcnnnpiw2qza030f1k (Pat): opening another task pushes its own entry, so Back returns to the
// task before it. Only closing replaces the entry.
test('opening a task pushes an entry; only closing the panel replaces it', () => {
  const page = readFileSync(new URL('../app/pages/projects/[id].vue', import.meta.url), 'utf8')
  const open = page.slice(page.indexOf('function openDrawerTask('), page.indexOf('function closeDrawer('))
  const close = page.slice(page.indexOf('function closeDrawer('), page.indexOf('// The old deep link'))
  assert.match(open, /navigateTo\(\{ path: taskPanelPath\(/)
  assert.equal(/replace/.test(open), false, 'opening never replaces the entry')
  assert.match(close, /\{ replace: true \}/)
})

// Criteria 5 and 7: a task URL whose task is not on the board (or cannot be read here) shows the notice and no panel.
// Source level; the browser check is on the card.
test('an unknown or unreadable task id shows the notice and the plain board', () => {
  const page = readFileSync(new URL('../app/pages/projects/[id].vue', import.meta.url), 'utf8')
  assert.match(page, /const unknownTask = computed\(\(\) => Boolean\(drawerTaskId\.value && board\.value && !drawerTask\.value\)\)/)
  assert.match(page, /v-if="unknownTask"\n\s+role="status"/)
  assert.match(page, /That task is not on this board, or you cannot open it here\. The board is shown without it\./)
})
