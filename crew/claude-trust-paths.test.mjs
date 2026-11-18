// Which paths the kit trusts (card mwk8koh1xf1jikjrkff, step 2): the crew home, the installed kit folder, and each person's session
// folder when that folder is one the crew made (a worktree directly under crew.json worktreeBase, named taskmanager-<...>). A folder
// the owner points a session at (a repository, anything else) is not trusted by the kit: it is listed as refused, with the sentence
// that says what to do.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crewOwnPaths, isCrewFolder } from './claude-trust.mjs'

const BASE = '/srv/agents/taskmanager-maintenance'
const HOME = '/srv/agents/taskmanager-maintenance/.config/taskmanager-crew'
const KIT = '/srv/agents/taskmanager-maintenance/.local/share/taskmanager-crew'

test('a worktree directly under the base, named taskmanager-<...>, is a crew folder', () => {
  assert.equal(isCrewFolder(`${BASE}/taskmanager-wick-mwk8koh1`, BASE), true)
  assert.equal(isCrewFolder(`${BASE}/taskmanager-wade-mwibpggp`, BASE), true)
})

test('the repository itself, a folder elsewhere, and a folder deeper in the base are not crew folders', () => {
  assert.equal(isCrewFolder(`${BASE}/taskmanager`, BASE), false, 'the repository has no dash after taskmanager')
  assert.equal(isCrewFolder('/home/owner/some-repo', BASE), false)
  assert.equal(isCrewFolder(`${BASE}/other/taskmanager-wick-x`, BASE), false, 'only directly under the base')
  assert.equal(isCrewFolder(`${BASE}/taskmanager-`, BASE), false, 'a name needs something after the dash')
})

test('the trust list is the home, the kit and the crew folders; a folder the owner points a session at is refused', () => {
  const res = crewOwnPaths({
    home: HOME,
    kit: KIT,
    worktreeBase: BASE,
    folders: [`${BASE}/taskmanager-wick-mwk8koh1`, '/home/owner/some-repo', `${BASE}/taskmanager-usher-qa`]
  })
  assert.deepEqual(res.trust, [HOME, KIT, `${BASE}/taskmanager-usher-qa`, `${BASE}/taskmanager-wick-mwk8koh1`].sort())
  assert.deepEqual(res.refused, ['/home/owner/some-repo'])
})

test('the list has each path once, and is sorted', () => {
  const res = crewOwnPaths({ home: HOME, kit: KIT, worktreeBase: BASE, folders: [HOME, `${BASE}/taskmanager-wick-a`, `${BASE}/taskmanager-wick-a`] })
  assert.deepEqual(res.trust, [...new Set(res.trust)].sort())
  assert.equal(res.trust.filter(p => p === HOME).length, 1)
})
