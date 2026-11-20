// Where the projects page sends a person who has no board of their own. A customer contact or a guest with no team is
// sent to the shared list, never to the 'Your first project' form. Anyone else keeps the form (they can create a
// project). Pure. Run:
//   node --import tsx --test tests/projects-entry.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { entryFor, firstRedirect, mayShowFirstProjectForm, redirectPending, sharedDecided, teamsLoaded } from '../app/utils/projectsEntry'

test('one redirect at a time: a pending invitation wins over the shared list', () => {
  assert.equal(firstRedirect('/shared-with-me', '/invite/abc'), '/invite/abc')
  assert.equal(firstRedirect('/shared-with-me', null), '/shared-with-me')
  assert.equal(firstRedirect(null, '/invite/abc'), '/invite/abc')
  assert.equal(firstRedirect(null, null), null)
})

test('a redirect is pending only while its target is set and its selection has not failed', () => {
  assert.equal(redirectPending('/shared-with-me', false), true)
  assert.equal(redirectPending(null, false), false)
  assert.equal(redirectPending('t1', true), false, 'a team selection that failed is no longer a pending redirect')
})

test('the shared list counts as decided once its fetch has finished, even when it failed', () => {
  assert.equal(sharedDecided('pending'), false)
  assert.equal(sharedDecided('idle'), false)
  assert.equal(sharedDecided('success'), true)
  assert.equal(sharedDecided('error'), true)
})

test('the first-project form does not paint until the page has decided to stay', () => {
  // Not decided yet: the teams or the shared list are still loading.
  assert.equal(mayShowFirstProjectForm({ ready: true, teamsPending: true, teamsLoaded: true, sharedLoaded: true, redirecting: false }), false)
  assert.equal(mayShowFirstProjectForm({ ready: true, teamsPending: false, teamsLoaded: true, sharedLoaded: false, redirecting: false }), false)
  assert.equal(mayShowFirstProjectForm({ ready: false, teamsPending: false, teamsLoaded: true, sharedLoaded: true, redirecting: false }), false)
})

test('the first-project form waits for the team list itself, not only for its fetch to finish', () => {
  // Before the team fetch starts, nothing is pending and the list is still empty: that is not a decision to stay.
  assert.equal(mayShowFirstProjectForm({ ready: true, teamsPending: false, teamsLoaded: false, sharedLoaded: true, redirecting: false }), false)
})

test('the first-project form does not paint while a redirect is on its way', () => {
  assert.equal(mayShowFirstProjectForm({ ready: true, teamsPending: false, teamsLoaded: true, sharedLoaded: true, redirecting: true }), false)
})

test('once decided and not redirecting, the form may show', () => {
  assert.equal(mayShowFirstProjectForm({ ready: true, teamsPending: false, teamsLoaded: true, sharedLoaded: true, redirecting: false }), true)
})

test('the teams count as loaded once their list has data or has failed to load', () => {
  assert.equal(teamsLoaded({ data: null, error: null }), false, 'not fetched yet')
  assert.equal(teamsLoaded({ data: [], error: null }), true, 'a person with no team is decided too')
  assert.equal(teamsLoaded({ data: null, error: { message: 'x' } }), true, 'a failed fetch does not keep the page waiting')
})

test('the projects page passes the team list state to the form gate', () => {
  const source = readFileSync(new URL('../app/pages/projects/index.vue', import.meta.url), 'utf8')
  assert.match(source, /teamsLoaded: teamsLoaded\.value/)
})

test('a customer contact with no team and no board is sent to the shared list, even with nothing shared yet', () => {
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
