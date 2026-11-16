// Where the projects page sends a person who has no board of their own. A customer contact or a guest with no team is
// sent to the shared list, never to the 'Your first project' form. Anyone else keeps the form (they can create a
// project). Pure. Run:
//   node --import tsx --test tests/projects-entry.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { entryFor } from '../app/utils/projectsEntry'

test('a customer contact with no team and no board is sent to the shared list, even with nothing shared yet', () => {
  assert.equal(entryFor({ asksNew: false, hasProjects: false, teamCount: 0, contact: true }), '/shared-with-me')
})

test('a guest with no team and no board is sent to the shared list', () => {
  assert.equal(entryFor({ asksNew: false, hasProjects: false, teamCount: 0, contact: true }), '/shared-with-me')
})

test('a team member keeps the first-project page when they have no board', () => {
  assert.equal(entryFor({ asksNew: false, hasProjects: false, teamCount: 1, contact: true }), null)
  assert.equal(entryFor({ asksNew: false, hasProjects: false, teamCount: 1, contact: false }), null)
})

test('a person with nothing and no contact keeps the first-project form, so they can create a board', () => {
  assert.equal(entryFor({ asksNew: false, hasProjects: false, teamCount: 0, contact: false }), null)
})

test('a person who has a board opens the page as before, whatever the contact flag', () => {
  assert.equal(entryFor({ asksNew: false, hasProjects: true, teamCount: 0, contact: true }), null)
})

test('the new-project link always stays on the page to name one', () => {
  assert.equal(entryFor({ asksNew: true, hasProjects: false, teamCount: 0, contact: true }), null)
})
