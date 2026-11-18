// The trust check before a session start (crew/claude-trust.mjs, card mwk8koh1xf1jikjrkff, steps 2 and 4). A fake config file and a
// fake crew home with a crew.json: nothing real is touched.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { recordedFolders, trustCrewFolders, trustForStart, notTrustedReason, readWorktreeBase } from './claude-trust.mjs'

const BASE = '/srv/agents/taskmanager-maintenance'
const KIT = '/srv/agents/taskmanager-maintenance/.local/share/taskmanager-crew'

function setup(worktreeBase = BASE) {
  const home = mkdtempSync(join(tmpdir(), 'trust-home-'))
  if (worktreeBase !== null) writeFileSync(join(home, 'crew.json'), `${JSON.stringify({ worktreeBase })}\n`)
  const file = join(mkdtempSync(join(tmpdir(), 'trust-cfg-')), '.claude.json')
  writeFileSync(file, `${JSON.stringify({ projects: {} })}\n`, { mode: 0o600 })
  return { home, file }
}

test('a start in a crew folder trusts the crew home, the kit and that folder, and reports ok', () => {
  const { home, file } = setup()
  const folder = `${BASE}/taskmanager-wick-mwk8koh1`
  const res = trustForStart({ home, kit: KIT, folder, file, worktreeBase: BASE })
  assert.equal(res.ok, true)
  const projects = JSON.parse(readFileSync(file, 'utf8')).projects
  for (const p of [home, KIT, folder]) assert.equal(projects[p].hasTrustDialogAccepted, true, `${p} is trusted`)
})

test('a start in a folder the crew did not make is refused, and the reason names the path and what crew update does', () => {
  const { home, file } = setup()
  const folder = '/home/owner/some-repo'
  const res = trustForStart({ home, kit: KIT, folder, file, worktreeBase: BASE })
  assert.equal(res.ok, false)
  assert.match(res.reason, /\/home\/owner\/some-repo/, 'names the path')
  assert.match(res.reason, /crew update/, 'says what crew update does')
  assert.match(res.reason, /the kit does not trust it/)
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).projects['/home/owner/some-repo'], undefined, 'nothing is written for it')
})

test('without a worktreeBase in crew.json, a session folder is not a crew folder: refused, fail closed', () => {
  const { home, file } = setup(null)
  assert.equal(readWorktreeBase(home), null)
  const res = trustForStart({ home, kit: KIT, folder: `${BASE}/taskmanager-wick-x`, file, worktreeBase: null })
  assert.equal(res.ok, false)
})

test('the not-trusted message names the path, says what crew update does, and never says "run claude once and accept"', () => {
  const text = notTrustedReason('/srv/agents/taskmanager-maintenance/taskmanager-wick-x', BASE)
  assert.match(text, /\/srv\/agents\/taskmanager-maintenance\/taskmanager-wick-x/)
  assert.match(text, /crew update/)
  assert.doesNotMatch(text, /accept/i)
  assert.doesNotMatch(text, /run claude once/i)
})

test('the recorded session folders are read from the session records, not from the mcp configs', () => {
  const { home } = setup()
  mkdirSync(join(home, 'sessions'), { recursive: true })
  writeFileSync(join(home, 'sessions', 'wick.json'), `${JSON.stringify({ id: 'abcdef12', folder: `${BASE}/taskmanager-wick-a` })}\n`)
  writeFileSync(join(home, 'sessions', 'wick.mcp.json'), `${JSON.stringify({ folder: '/not/a/record' })}\n`)
  writeFileSync(join(home, 'sessions', 'broken.json'), '{ nope')
  assert.deepEqual(recordedFolders(home), [`${BASE}/taskmanager-wick-a`])
})

test('crew update trusts the home, the kit and the recorded crew folders, and reports the folders it refuses', () => {
  const { home, file } = setup()
  const res = trustCrewFolders({ home, kit: KIT, file, folders: [`${BASE}/taskmanager-wick-a`, '/home/owner/repo'] })
  assert.equal(res.ok, true)
  assert.deepEqual(res.refused, ['/home/owner/repo'])
  const projects = JSON.parse(readFileSync(file, 'utf8')).projects
  for (const p of [home, KIT, `${BASE}/taskmanager-wick-a`]) assert.equal(projects[p].hasTrustDialogAccepted, true, `${p} is trusted`)
  assert.equal(projects['/home/owner/repo'], undefined)
})

test('a config file that is not valid JSON stops the start with the module\'s sentence', () => {
  const { home, file } = setup()
  writeFileSync(file, '{ broken')
  const res = trustForStart({ home, kit: KIT, folder: `${BASE}/taskmanager-wick-x`, file, worktreeBase: BASE })
  assert.equal(res.ok, false)
  assert.match(res.reason, /not valid JSON/)
})
