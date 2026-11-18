// The team settings sections (Quincy's QA of redesign 8/9, mwc4jn0gozwdfd89e3): Invitations is a section of its own, and the
// section named "Board defaults" is called Projects. Source level. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/team-settings-sections.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const team = readFileSync(new URL('../app/pages/team.vue', import.meta.url), 'utf8')

// The block of the template that draws one section: from its <template v-if/else-if> line to the next section's line.
function sectionBlock(id: string): string {
  const start = team.indexOf(`section === '${id}'`)
  if (start < 0) return ''
  const rest = team.slice(start + 1)
  const next = rest.search(/<!-- [^>]*? -->\s*\n\s*<(template v-else-if|TeamRulesPanel|TeamCrewsPanel|TeamKeysPanel)/)
  return next < 0 ? team.slice(start) : team.slice(start, start + 1 + next)
}

test('Invitations is a team section with its own id and label', () => {
  assert.match(team, /\{ id: 'invitations', label: 'Invitations'/)
})

test('the invitations section shows the invite panel, and Members no longer does', () => {
  const invitations = sectionBlock('invitations')
  assert.ok(invitations.length > 0, 'no template block for the invitations section')
  assert.match(invitations, /<TeamInvitesPanel/)
  const members = sectionBlock('members')
  assert.ok(members.length > 0, 'no template block for the members section')
  assert.equal(members.includes('<TeamInvitesPanel'), false)
})

test('the invitations section is for owners and admins only, like the panel it shows', () => {
  assert.match(team, /\.\.\.\(isTeamAdmin\.value \? \[\{ id: 'invitations'/)
})

test('the section that sets the starting columns is named Projects, not Board defaults', () => {
  assert.match(team, /\{ id: 'boards', label: 'Projects'/)
  assert.equal(team.includes('label: \'Board defaults\''), false)
})
