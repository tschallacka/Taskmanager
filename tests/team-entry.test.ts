// Which team a person's projects page opens when they sign in again in a new browser. A team member whose personal
// workspace is empty and who has no team selected opens their team, so the team's boards show and not the
// 'Your first project' form. Someone who chose the personal workspace (it has boards, or they asked for a new one)
// keeps it. Pure. Run:
//   node --import tsx --test tests/team-entry.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { teamToOpenFor } from '../app/utils/teamEntry'

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
