// The board page's top-bar crumb "Team › Project" (redesign 3/9 rest). The page is a Vue component, so the test reads
// its source, as tests/board-page-chips.test.ts does. It checks that the team name comes from the team list by the
// board's team id, and that the crumb is shown on a normal board only (a shadow board keeps its own crumb). Run:
//   node --test tests/board-page-crumb.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const page = readFileSync(join(process.cwd(), 'app', 'pages', 'projects', '[id].vue'), 'utf8')

test('the team name is looked up in the team list by the board\'s team id', () => {
  assert.match(page, /const \{ activeTeamId, setActiveTeam, teams \} = useTeams\(\)/)
  assert.match(page, /const teamName = computed\(\(\) => \{/)
  assert.match(page, /teams\.value\.find\(team => team\.id === id\)\?\.name \?\? null/)
})

test('the crumb shows team, then project, on a normal board only', () => {
  assert.match(page, /data-team-crumb/)
  assert.match(page, /v-if="activeProject && !activeProject\.realBoard && teamName"/)
  assert.match(page, /\{\{ teamName \}\}/)
  assert.match(page, /\{\{ activeProject\.name \}\}/)
})
