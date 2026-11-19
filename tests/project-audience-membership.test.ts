// Nina's CQ 1 on part 2 (card mwjfx58bi6p4dqqeo8, head 8d10a1a): the project list decided staff by the caller's active team, so a
// team member who lists a project of another team they belong to saw the customer as a customer, and lost the customer's
// name. Staff is decided by team membership, the same test as boardPins.ts (workspaceTeam). Pure. Run:
//   node --import tsx --test tests/project-audience-membership.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { audienceByMembership } from '../shared/utils/projectAudience'

const teams = new Set(['team-a', 'team-b'])

test('a member of the project team is staff, even when their active team is another team', () => {
  assert.equal(audienceByMembership('ada', teams, { userId: 'bob', teamId: 'team-b' }), 'staff')
})

test('a person outside the project team is a customer', () => {
  assert.equal(audienceByMembership('ada', new Set(['team-a']), { userId: 'bob', teamId: 'team-b' }), 'customer')
})

test('a personal project is staff for its own user only', () => {
  assert.equal(audienceByMembership('ada', teams, { userId: 'ada', teamId: null }), 'staff')
  assert.equal(audienceByMembership('ada', teams, { userId: 'bob', teamId: null }), 'customer')
})

test('the project list decides staff by membership, not by the active team', () => {
  const source = readFileSync(new URL('../server/api/projects.ts', import.meta.url), 'utf8')
  assert.match(source, /audienceByMembership\(/)
  assert.equal(/audienceFor\(userId, teamId, project\)/.test(source), false, 'no active-team test left in the list')
})
