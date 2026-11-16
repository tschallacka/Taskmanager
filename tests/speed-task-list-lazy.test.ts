// Speed, step B: the flat task list (/api/tasks, about 1.5 MB on the live site) is not fetched when the app loads. It is
// fetched once, when the first screen or the search needs it. Source level: it reads the files, so it fails on the old
// load path.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the app start does not fetch the task list', () => {
  const plugin = read('app/plugins/init-projects.client.ts')
  assert.doesNotMatch(plugin, /\/api\/tasks'/, 'the start plugin fetches projects only')
  const composable = read('app/composables/useProjects.ts')
  const load = composable.slice(composable.indexOf('async function load()'), composable.indexOf('// Fetches the flat task index once'))
  assert.doesNotMatch(load, /\/api\/tasks/, 'load() fetches projects only')
})

test('the task list is fetched once, on demand, through ensureTasks', () => {
  const composable = read('app/composables/useProjects.ts')
  assert.match(composable, /async function ensureTasks\(\)/)
  const ensure = composable.slice(composable.indexOf('async function ensureTasks()'), composable.indexOf('async function ensureTasks()') + 400)
  assert.match(ensure, /if \(_tasksLoaded\.value\)/, 'a second call does not fetch again')
  assert.match(composable, /ensureTasks,/, 'ensureTasks is returned to the pages')
})

test('every screen that reads the task list asks for it first', () => {
  for (const page of [
    'app/components/SearchModal.vue',
    'app/components/ProjectsListPanel.vue',
    'app/pages/projects/home.vue',
    'app/pages/projects/my-tasks.vue',
    'app/pages/projects/timesheet.vue',
    'app/pages/projects/profile.vue'
  ]) {
    assert.match(read(page), /ensureTasks\(/, `${page} asks for the task list before it reads it`)
  }
})
