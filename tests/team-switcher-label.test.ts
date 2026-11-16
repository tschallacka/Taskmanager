// The workspace switcher's label. While the active team is still loading, the label must not claim
// "Personal Workspace": a team member who lands in a team (after accepting an invitation) sees the team's boards
// first, and the label must agree with them. Pure. Run:
//   node --import tsx --test tests/team-switcher-label.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { workspaceLabel } from '../app/utils/workspaceLabel'

test('an active team shows its name', () => {
  assert.equal(workspaceLabel({ teamName: 'Acme', pending: false }), 'Acme')
  assert.equal(workspaceLabel({ teamName: 'Acme', pending: true }), 'Acme')
})

test('no team and nothing loading is the personal workspace', () => {
  assert.equal(workspaceLabel({ teamName: null, pending: false }), 'Personal Workspace')
})

test('no team yet while the teams load does not claim the personal workspace', () => {
  assert.equal(workspaceLabel({ teamName: null, pending: true }), 'Loading workspace')
})

test('the switcher trigger reads the label from the helper, not a bare personal fallback', () => {
  const vue = readFileSync(join(import.meta.dirname, '..', 'app', 'components', 'TeamSwitcher.vue'), 'utf8')
  assert.match(vue, /workspaceLabel\(/)
  assert.doesNotMatch(vue, /\{\{\s*activeTeam \? activeTeam\.name : 'Personal Workspace'\s*\}\}/)
})
