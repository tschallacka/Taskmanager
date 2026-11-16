// The loaded crew config exports worktreeBase (card mwifypvkc453w4k6wp): init reads it for its warning, and
// `crew <who> prepare worktree` reads it from the loaded config. config.mjs runs at import, so each case loads it in a
// child process with its own CREW_HOME and a crew.json written for that case. Run:
//   cd crew && node --test worktree-base-config.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { worktreeFolder } from './prepare-worktree.mjs'

const kit = import.meta.dirname

// A crew home with a crew.json holding `extra`; returns the worktreeBase the loader gives (or the child's error).
function loadedBase(extra) {
  const home = mkdtempSync(join(tmpdir(), 'crew-wt-'))
  writeFileSync(join(home, 'crew.json'), JSON.stringify({ team: 'Crew', ...extra }))
  const script = `import(${JSON.stringify(join(kit, 'config.mjs'))}).then(m => process.stdout.write(JSON.stringify(m.config.worktreeBase)))`
  const out = execFileSync(process.execPath, ['-e', script], { env: { ...process.env, CREW_HOME: home }, encoding: 'utf8' })
  return JSON.parse(out)
}

test('an absolute worktreeBase from crew.json is exported by the loader, without the trailing slash', () => {
  assert.equal(loadedBase({ worktreeBase: '/srv/agents/taskmanager-maintenance/' }), '/srv/agents/taskmanager-maintenance')
  assert.equal(loadedBase({ worktreeBase: '/srv/agents/taskmanager-maintenance' }), '/srv/agents/taskmanager-maintenance')
})

// The prepare worktree command, run for real with a crew home holding `extra` in crew.json. It stops before any board
// call (the card is read after the folder is known), so no network is used: the temp home has no creds.json.
function runCli(extra) {
  const home = mkdtempSync(join(tmpdir(), 'crew-wt-cli-'))
  writeFileSync(join(home, 'crew.json'), JSON.stringify({ team: 'Crew', ...extra }))
  return spawnSync(process.execPath, [join(kit, 'prepare-worktree-cli.mjs'), 'wren', 'mwifypvkc453w4k6wp'], { env: { ...process.env, CREW_HOME: home }, encoding: 'utf8' })
}

test('prepare worktree with an absolute worktreeBase in crew.json gets past the folder check: no worktreeBase message', () => {
  // Before the export, the command built its folder from a config without worktreeBase and refused this file.
  const run = runCli({ worktreeBase: '/srv/agents/taskmanager-maintenance/' })
  assert.doesNotMatch(run.stderr, /no worktreeBase/)
  assert.match(run.stderr, /could not read the card mwifypvkc453w4k6wp/)
  assert.equal(run.status, 1)
})

test('prepare worktree resolves the folder from the loaded config', () => {
  const base = loadedBase({ worktreeBase: '/srv/agents/taskmanager-maintenance/' })
  const folder = worktreeFolder({ config: { worktreeBase: base }, who: 'wren', taskId: 'mwifypvkc453w4k6wp' })
  assert.deepEqual(folder, { ok: true, path: '/srv/agents/taskmanager-maintenance/taskmanager-wren-mwifypvk' })
})

test('a missing worktreeBase is exported as an empty string, and prepare worktree says so in one line', () => {
  const base = loadedBase({})
  assert.equal(base, '')
  const folder = worktreeFolder({ config: { worktreeBase: base }, who: 'wren', taskId: 'mwifypvkc453w4k6wp' })
  assert.equal(folder.ok, false)
  assert.match(folder.message, /crew\.json has no worktreeBase \(an absolute folder\)/)
  assert.equal(folder.message.includes('\n'), false)
})

test('a relative worktreeBase is kept as written, and prepare worktree refuses it with the clear message', () => {
  const base = loadedBase({ worktreeBase: 'relative/dir' })
  assert.equal(base, 'relative/dir')
  const folder = worktreeFolder({ config: { worktreeBase: base }, who: 'wren', taskId: 'mwifypvkc453w4k6wp' })
  assert.equal(folder.ok, false)
  assert.match(folder.message, /no worktreeBase \(an absolute folder\)/)
})

test('prepare worktree with a relative or missing worktreeBase refuses with the one-line message, before reading the card', () => {
  for (const extra of [{ worktreeBase: 'relative/dir' }, {}]) {
    const run = runCli(extra)
    assert.equal(run.status, 1)
    assert.equal(run.stderr.trim(), 'crew.json has no worktreeBase (an absolute folder); set it, then run this again')
  }
})
