// Where an accepted invitation lands: a team and a board keep their working page; a customer goes to the one project
// shared with them, or to the list of shared projects (which says so when there are none). A customer is never sent
// to /projects, the personal workspace whose 'Your first project' page is what the owner saw. Pure. Run:
//   node --import tsx --test tests/invite-landing.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { landingFor } from '../app/utils/inviteLanding'

test('a team invite lands on the projects page of the team it joined', () => {
  assert.equal(landingFor({ kind: 'team' }), '/projects')
})

test('a board invite lands on the board it was invited to', () => {
  assert.equal(landingFor({ kind: 'board', projectId: 'p1' }), '/projects/p1')
})

test('a customer invite with exactly one shared project opens that project', () => {
  assert.equal(landingFor({ kind: 'customer', sharedProjectIds: ['p9'] }), '/projects/p9')
})

test('a customer invite with several shared projects lands on the shared list', () => {
  assert.equal(landingFor({ kind: 'customer', sharedProjectIds: ['p1', 'p2'] }), '/shared-with-me')
})

test('a customer invite with nothing shared yet lands on the shared list, which says so', () => {
  assert.equal(landingFor({ kind: 'customer', sharedProjectIds: [] }), '/shared-with-me')
})

test('a customer is never sent to the personal projects page', () => {
  assert.notEqual(landingFor({ kind: 'customer', sharedProjectIds: [] }), '/projects')
  assert.notEqual(landingFor({ kind: 'customer', sharedProjectIds: ['p1'] }), '/projects')
  assert.notEqual(landingFor({ kind: 'customer', sharedProjectIds: ['p1', 'p2'] }), '/projects')
})
