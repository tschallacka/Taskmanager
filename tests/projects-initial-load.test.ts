// The first project load in the browser (source level): when the first fetch fails, the list must not be marked ready with no projects,
// because "No projects yet" would show for a person who has projects; and the projects page shows a text line while the list loads.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('a failed first load does not mark the project list ready with an empty list', () => {
  const plugin = read('app/plugins/init-projects.client.ts')
  const catchBlock = plugin.slice(plugin.indexOf('} catch {'), plugin.indexOf('} catch {') + 600)
  assert.doesNotMatch(catchBlock, /initProjectsStore\(\[\], \[\]/, 'the catch must not set the store ready with no projects')
  assert.match(plugin, /loadInitialProjects\(/, 'the plugin loads through loadInitialProjects, which retries once and initialises the store with the full answer')
  assert.doesNotMatch(catchBlock, /useProjects\(\)\.load\(\)/, 'the catch no longer calls load(), which left the search index unset')
})
