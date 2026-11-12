// The home page's lists (redesign 6/9): My tasks grouped by due date, the Getting started steps, and the project rows.
// Pure: no browser. Run: node --import tsx --test tests/home-view.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gettingStartedSteps, projectNameOf, projectRows, taskGroups } from '../app/utils/homeView'

test('projectNameOf: the chip on a My tasks row names the task\'s project, and nothing when the project is not listed', () => {
  const projects = [{ id: 'p1', name: 'Website' }, { id: 'p2', name: 'Launch' }]
  assert.equal(projectNameOf('p2', projects), 'Launch')
  assert.equal(projectNameOf('gone', projects), null)
  assert.equal(projectNameOf('p1', []), null)
})

// Thursday 12 November 2026, noon: the day the tests are about.
const NOW = new Date(2026, 10, 12, 12)
const TODAY = '2026-11-12'

test('taskGroups: overdue first, then today, then later; undated tasks are later; empty groups are left out', () => {
  const tasks = [
    { id: 'late', dueOn: '2026-11-10' },
    { id: 'today', dueOn: TODAY },
    { id: 'soon', dueOn: '2026-11-20' },
    { id: 'undated', dueOn: null }
  ]
  const groups = taskGroups(tasks, TODAY, NOW)
  assert.deepEqual(groups.map(group => group.key), ['overdue', 'today', 'later'])
  assert.deepEqual(groups.map(group => group.label), ['Overdue', 'Today', 'Later'])
  assert.deepEqual(groups[0].tasks.map(task => task.id), ['late'])
  assert.deepEqual(groups[1].tasks.map(task => task.id), ['today'])
  assert.deepEqual(groups[2].tasks.map(task => task.id), ['soon', 'undated'])
})

test('taskGroups: a group with no task is not listed', () => {
  const groups = taskGroups([{ id: 'soon', dueOn: '2026-11-20' }], TODAY, NOW)
  assert.deepEqual(groups.map(group => group.key), ['later'])
  assert.deepEqual(taskGroups([], TODAY, NOW), [])
})

test('taskGroups: a task due today is not overdue, whatever the hour', () => {
  const groups = taskGroups([{ id: 'now', dueOn: TODAY }], TODAY, new Date(2026, 10, 12, 23, 59))
  assert.deepEqual(groups.map(group => group.key), ['today'])
})

test('gettingStartedSteps: five steps in order, each done from its own fact', () => {
  const steps = gettingStartedSteps({ hasProject: true, hasTask: false, hasFinishedTask: false, inviteDone: true, agentDone: false })
  assert.deepEqual(steps.map(step => step.key), ['project', 'task', 'finish', 'invite', 'agent'])
  assert.deepEqual(steps.map(step => step.label), ['Create a project', 'Add a task', 'Finish one', 'Invite someone', 'Let an agent help'])
  assert.deepEqual(steps.map(step => step.done), [true, false, false, true, false])
})

test('gettingStartedSteps: a brand new person has nothing done', () => {
  const steps = gettingStartedSteps({ hasProject: false, hasTask: false, hasFinishedTask: false, inviteDone: false, agentDone: false })
  assert.equal(steps.filter(step => step.done).length, 0)
  assert.equal(steps.length, 5)
})

test('projectRows: counts, done, the latest change and the percent of each project\'s own tasks', () => {
  const projects = [{ id: 'p1', status: 'on_track' }, { id: 'p2', status: null }]
  const tasks = [
    { projectId: 'p1', completedAt: 5, updatedAt: 10 },
    { projectId: 'p1', completedAt: null, updatedAt: 30 },
    { projectId: 'p1', completedAt: null, updatedAt: 20 },
    { projectId: 'p2', completedAt: null, updatedAt: null }
  ]
  const rows = projectRows(projects, tasks)
  assert.deepEqual(rows.map(row => [row.project.id, row.total, row.done, row.latest, row.percent]), [
    ['p1', 3, 1, 30, 33],
    ['p2', 1, 0, 0, 0]
  ])
})

test('projectRows: a project with no tasks shows zero, and only the first six projects are listed', () => {
  const projects = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, status: null }))
  const rows = projectRows(projects, [])
  assert.equal(rows.length, 6)
  assert.deepEqual(rows[0], { project: projects[0], total: 0, done: 0, latest: 0, percent: 0 })
})
