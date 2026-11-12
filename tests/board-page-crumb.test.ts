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

test('the health chip shows the project status from Overview, with its word, and nothing when none is set', () => {
  assert.match(page, /const HEALTH = \{/)
  assert.match(page, /on_track: \{ label: 'On track', tone: 'tm-tone-ok', dot: 'tm-dot-ok' \}/)
  assert.match(page, /at_risk: \{ label: 'At risk', tone: 'tm-tone-warn', dot: 'tm-dot-warn' \}/)
  assert.match(page, /off_track: \{ label: 'Off track', tone: 'tm-tone-danger', dot: 'tm-dot-danger' \}/)
  assert.match(page, /return status \? HEALTH\[status\] : null/)
  assert.match(page, /v-if="healthChip"/)
  assert.match(page, /data-health-chip/)
})

test('the board shows its people as avatars: four, then a count; none for a customer', () => {
  assert.match(page, /fetch<\{ people: \{ id: string, name: string, image\?: string \| null \}\[\] \}>\(`\/api\/projects\/\$\{id\}\/members`\)/)
  assert.match(page, /if \(id && !isCustomerView\.value\) loadBoardPeople\(id\)/)
  assert.match(page, /v-if="boardPeople\.length"/)
  assert.match(page, /boardPeople\.slice\(0, 4\)/)
  assert.match(page, />\+\{\{ boardPeople\.length - 4 \}\}</)
  assert.match(page, /data-board-avatars/)
})

test('row 2 shows the five main views as tabs, in design order, and the rest under More, with the Office help', () => {
  assert.match(page, /const PRIMARY_VIEWS = \['board', 'list', 'calendar', 'timeline', 'dashboard'\]/)
  assert.match(page, /v-for="v in primaryViews"/)
  assert.match(page, /const moreViews = computed\(\(\) => tabViews\.value\.filter\(v => !PRIMARY_VIEWS\.includes\(v\.key\)\)\)/)
  assert.match(page, /data-view-more/)
  assert.match(page, /v-if="moreViews\.some\(v => v\.key === 'office'\)"/)
  assert.match(page, /page="agents\/office-view"/)
})
