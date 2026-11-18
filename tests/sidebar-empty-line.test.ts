// The sidebar's "No projects yet" line (source level): it waits for the teams to settle. Until they do, the list may still be the
// personal workspace's (empty for someone who only has a shared board), so the line would flash for a person who has projects.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('"No projects yet" waits for the teams to settle, not only for the list to be ready', () => {
  const panel = read('app/components/ProjectsListPanel.vue')
  const line = panel.slice(panel.indexOf('No projects yet') - 260, panel.indexOf('No projects yet'))
  assert.match(line, /ready && projects\.length === 0 && mayCreate && !teamsPending && !openingTeam/, 'the empty line needs the teams to have settled, and no team to be opened')
  assert.match(panel, /const openingTeam = computed\(\(\) => teamToOpenFor\(/, 'a person who has a team to open is not told they have no projects')
})
