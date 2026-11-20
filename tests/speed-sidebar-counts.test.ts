// Speed, the sidebar (card mwibpggpqn4ml5tmntg, Boss's ruling on PRECHECK): the sidebar's open-task counts must not load the full
// task list on every page. The counts come from a slim mode of the same endpoint (/api/tasks?fields=counts: id, project, column
// only, with the same access rules), and the full list is loaded only by the screens that read its text. Source-level: it reads
// the files, so it fails on the old load path.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the flat task endpoint has a counts mode that returns only id, project and column', () => {
  const endpoint = read('server/api/tasks.get.ts')
  assert.match(endpoint, /getQuery\(event\)\.fields === 'counts'/, 'the counts mode is selected by the query')
  const counts = endpoint.slice(endpoint.indexOf('const countFields'), endpoint.indexOf('const countFields') + 200)
  assert.match(counts, /id: projectTasks\.id/)
  assert.match(counts, /projectId: projectTasks\.projectId/)
  assert.match(counts, /columnId: projectTasks\.columnId/)
  assert.doesNotMatch(counts, /description|title|tags/, 'the counts mode carries no text')
  assert.match(endpoint, /\.select\(slim \? countFields : fullFields\)/, 'the same query serves both modes, so the access rules are one code path')
})

test('the sidebar loads the counts, not the full list, when it mounts', () => {
  const panel = read('app/components/ProjectsListPanel.vue')
  const at = panel.indexOf('if (!pinsLoaded.value) loadPins()')
  assert.ok(at >= 0, 'the sidebar mount is there')
  const mounted = panel.slice(at, at + 300)
  assert.match(mounted, /ensureTaskCounts\(\)/, 'the sidebar asks for the counts')
  assert.doesNotMatch(mounted, /ensureTasks\(\)/, 'the sidebar does not ask for the full list')
  assert.match(panel, /const \{ ready, projects, taskCounts, deleteProject, renameProject, ensureTaskCounts \} = useProjects\(\)/)
})

test('the store keeps a slim count list, fetched once, and counts from it until the full list is loaded', () => {
  const store = read('app/composables/useProjects.ts')
  assert.match(store, /const _countRows = ref<TaskCountRow\[\]>\(\[\]\)/)
  const ensure = store.slice(store.indexOf('async function ensureTaskCounts()'), store.indexOf('async function ensureTaskCounts()') + 500)
  assert.match(ensure, /fields=counts/, 'the request asks for the slim mode')
  assert.match(ensure, /if \(_tasksLoaded\.value\) return/, 'a loaded full list already has the counts')
  assert.match(store, /const taskCounts = computed\(\(\) => countOpenTasks\(\s*_tasksLoaded\.value \? _allTasks\.value : _countRows\.value/, 'the sidebar counts come from the full list when loaded, else the slim one')
})

test('a change to one task keeps the slim counts in step, and a team switch drops them', () => {
  const store = read('app/composables/useProjects.ts')
  const upsert = store.slice(store.indexOf('function upsertSearchRow'), store.indexOf('function upsertSearchRow') + 1200)
  assert.match(upsert, /_countRows\.value/, 'an upsert updates the slim counts too')
  const remove = store.slice(store.indexOf('function removeSearchRow'), store.indexOf('function removeSearchRow') + 300)
  assert.match(remove, /_countRows\.value/, 'a removal updates the slim counts too')
  const refresh = store.slice(store.indexOf('async function refresh()'), store.indexOf('async function refresh()') + 1200)
  assert.match(refresh, /_countRows\.value = \[\]/, 'a team switch drops the slim counts')
})
