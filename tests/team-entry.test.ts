// Which team a person's projects page opens when they sign in again in a new browser. A team member whose personal
// workspace is empty and who has no team selected opens their team, so the team's boards show and not the
// 'Your first project' form. Someone who chose the personal workspace (it has boards, or they asked for a new one)
// keeps it. Pure. Run:
//   node --import tsx --test tests/team-entry.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { selectTeamOrStay, teamRedirectAllowed, teamToOpenFor } from '../app/utils/teamEntry'

test('the team redirect waits while a shared-list or invitation redirect is pending (one decision at a time)', () => {
  assert.equal(teamRedirectAllowed({ contactTarget: null, inviteTarget: null }), true)
  assert.equal(teamRedirectAllowed({ contactTarget: '/shared-with-me', inviteTarget: null }), false)
  assert.equal(teamRedirectAllowed({ contactTarget: null, inviteTarget: '/invite/abc' }), false)
})

test('when selecting the team works, the page reloads into it (true)', async () => {
  let selected: string | null = null
  const ok = await selectTeamOrStay(async (id) => {
    selected = id
  }, 't1')
  assert.equal(ok, true)
  assert.equal(selected, 't1')
})

test('when selecting the team fails, the person stays where they are (false), and nothing is thrown', async () => {
  const ok = await selectTeamOrStay(async () => {
    throw new Error('network down')
  }, 't1')
  assert.equal(ok, false)
})

test('a team member with no team selected and an empty personal workspace opens their team', () => {
  assert.equal(teamToOpenFor({ asksNew: false, hasProjects: false, activeTeamId: null, teamIds: ['t1'] }), 't1')
})

test('with several teams and none selected, the first one opens', () => {
  assert.equal(teamToOpenFor({ asksNew: false, hasProjects: false, activeTeamId: null, teamIds: ['t1', 't2'] }), 't1')
})

test('a team already selected stays selected', () => {
  assert.equal(teamToOpenFor({ asksNew: false, hasProjects: false, activeTeamId: 't2', teamIds: ['t1', 't2'] }), null)
})

test('a personal workspace with boards is left alone', () => {
  assert.equal(teamToOpenFor({ asksNew: false, hasProjects: true, activeTeamId: null, teamIds: ['t1'] }), null)
})

test('asking for a new project stays in the personal workspace', () => {
  assert.equal(teamToOpenFor({ asksNew: true, hasProjects: false, activeTeamId: null, teamIds: ['t1'] }), null)
})

test('no team at all: nothing to open', () => {
  assert.equal(teamToOpenFor({ asksNew: false, hasProjects: false, activeTeamId: null, teamIds: [] }), null)
})
