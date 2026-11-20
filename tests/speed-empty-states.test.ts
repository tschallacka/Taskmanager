// Speed, Nina's SHOULD 1 (card mwibpggp): an empty-state line ("Nothing assigned to you.", "Nothing in {tab}.", "Nothing found for ...")
// is a claim about the account, so it shows only once the task list has loaded. While the list loads, a loading line shows; when the
// load fails, a failed line shows, not the empty line. Source-level: it reads the pages and the store.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the store exposes whether the task list has loaded, and whether its load failed', () => {
  const store = read('app/composables/useProjects.ts')
  assert.match(store, /const _tasksFailed = ref\(false\)/)
  assert.match(store, /tasksLoaded: computed\(\(\) => _tasksLoaded\.value\)/)
  assert.match(store, /tasksFailed: computed\(\(\) => _tasksFailed\.value\)/)
  const ensure = store.slice(store.indexOf('async function ensureTasks()'), store.indexOf('async function ensureTasks()') + 900)
  assert.match(ensure, /\.catch\(\(error: unknown\) => \{/, 'a failed load is recorded, not dropped')
  assert.match(ensure, /_tasksFailed\.value = true/)
  assert.match(ensure, /_tasksFailed\.value = false/, 'a new load clears the failure')
  const refresh = store.slice(store.indexOf('async function refresh()'), store.indexOf('async function refresh()') + 1400)
  assert.match(refresh, /_tasksFailed\.value = false/, 'a team switch clears the failure')
})

const pages: { path: string, empty: string, loading: string, failed: string }[] = [
  { path: 'app/pages/projects/home.vue', empty: 'Nothing assigned to you.', loading: 'Loading your tasks', failed: 'Your tasks could not be loaded' },
  { path: 'app/pages/projects/profile.vue', empty: 'Nothing assigned to you.', loading: 'Loading your tasks', failed: 'Your tasks could not be loaded' },
  { path: 'app/pages/projects/my-tasks.vue', empty: 'Nothing in {{ tab.toLowerCase() }}.', loading: 'Loading your tasks', failed: 'Your tasks could not be loaded' },
  { path: 'app/components/SearchModal.vue', empty: 'Nothing found for', loading: 'Loading tasks to search', failed: 'Tasks could not be loaded to search' }
]

for (const page of pages) {
  test(`${page.path}: the empty line shows only after the task list has loaded; loading and failed lines cover the rest`, () => {
    const source = read(page.path)
    const at = source.indexOf(page.empty)
    assert.ok(at > 0, `${page.empty} is there`)
    // The v-if of the element that holds the empty line: the 300 characters before the text.
    const before = source.slice(Math.max(0, at - 300), at)
    assert.match(before, /tasksLoaded/, 'the empty line is gated on the task list having loaded')
    assert.match(before, /!tasksFailed/, 'a failed load never shows the empty line')
    assert.match(source, /v-else-if="[^"]*tasksFailed[^"]*"/, 'a failed load has its own line')
    assert.ok(source.includes(page.failed), `${page.failed} is the failed line`)
    assert.ok(source.includes(page.loading), `${page.loading} is the loading line`)
    assert.match(source, /tasksFailed/)
    assert.match(source, /tasksLoaded/)
  })
}
