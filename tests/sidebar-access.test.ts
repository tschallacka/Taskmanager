// What the sidebar shows for a person by what they can reach. A team member sees the team items as before. A person
// with only customer access (no team) does not see the team items, and sees a group of the projects shared with
// them, named after the organisation that shared them. Pure. Run:
//   node --import tsx --test tests/sidebar-access.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { mayCreateProjects, panelListsProject, sidebarAccess } from '../app/utils/sidebarAccess'

test('a customer contact with no team and nothing shared is not offered Create one', () => {
  assert.equal(mayCreateProjects({ teamCount: 0, contact: true }), false)
})

test('a team member, or a person who is not a contact, may still create', () => {
  assert.equal(mayCreateProjects({ teamCount: 1, contact: true }), true)
  assert.equal(mayCreateProjects({ teamCount: 0, contact: false }), true)
})

test('a shared project is listed in its group only, not again under PROJECTS, for a person with no team', () => {
  assert.equal(panelListsProject({ teamCount: 0, sharedIds: new Set(['p1']) }, 'p1'), false)
  assert.equal(panelListsProject({ teamCount: 0, sharedIds: new Set(['p1']) }, 'own'), true, 'their own board stays listed')
})

test('while the teams are still loading, nothing is hidden', () => {
  assert.equal(panelListsProject({ teamCount: 0, sharedIds: new Set(['p1']), teamsPending: true }, 'p1'), true)
  assert.equal(mayCreateProjects({ teamCount: 0, contact: true, teamsPending: true }), true)
})

test('a team member keeps every project in PROJECTS, shared or not', () => {
  assert.equal(panelListsProject({ teamCount: 1, sharedIds: new Set(['p1']) }, 'p1'), true)
})

const shared = [
  { organizationName: 'Tschallacka\'s Organisation', projects: [{ id: 'p1', name: 'Garden plan' }] }
]

test('a team member sees the team items, with or without shared groups', () => {
  assert.equal(sidebarAccess({ teamCount: 1, sharedGroups: [] }).teamItems, true)
  assert.equal(sidebarAccess({ teamCount: 2, sharedGroups: shared }).teamItems, true)
})

test('a person with only customer access does not see the team items', () => {
  assert.equal(sidebarAccess({ teamCount: 0, sharedGroups: shared }).teamItems, false)
})

test('a person with nothing shared and no team sees neither team items nor a group', () => {
  const access = sidebarAccess({ teamCount: 0, sharedGroups: [] })
  assert.equal(access.teamItems, false)
  assert.deepEqual(access.groups, [])
})

test('the shared group is named after the organisation and lists its projects', () => {
  const access = sidebarAccess({ teamCount: 0, sharedGroups: shared })
  assert.deepEqual(access.groups, [
    { label: 'Tschallacka\'s Organisation', projects: [{ id: 'p1', name: 'Garden plan' }] }
  ])
})

test('two organisations give two groups, in the order they came', () => {
  const access = sidebarAccess({
    teamCount: 0,
    sharedGroups: [
      { organizationName: 'Alpha', projects: [{ id: 'a1', name: 'A' }] },
      { organizationName: 'Beta', projects: [{ id: 'b1', name: 'B' }, { id: 'b2', name: 'C' }] }
    ]
  })
  assert.deepEqual(access.groups.map(group => group.label), ['Alpha', 'Beta'])
  assert.equal(access.groups[1].projects.length, 2)
})
