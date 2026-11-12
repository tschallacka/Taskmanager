// The kit side of `crew <who> prepare worktree <task-id>`: the arguments reach the project script, its one result line is
// read, and a missing script, a failing script or a malformed line each give a clear message. A fake runner stands in
// for the script, so no git, dependency or database work runs here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseResultLine, prepareWorktree, slugOf } from './prepare-worktree.mjs'

const config = { scripts: { prepareWorktree: '/home/boss/work/boss/prepare-worktree.sh' } }

test('the script gets who, the task id and a slug of the title, and its result line is returned', () => {
  const calls = []
  const runner = (script, args) => {
    calls.push({ script, args })
    return { status: 0, stdout: 'starting\nworktree /srv/w/taskmanager-wren-mwdlkxb5 branch wren/mwdlkxb56xr2ek89g92-prepare-worktree db arnotes_test_wren\n', stderr: '' }
  }
  const result = prepareWorktree({ who: 'wren', taskId: 'mwdlkxb56xr2ek89g92', title: 'Prepare worktree: the command!', config, runner })
  assert.deepEqual(calls, [{ script: '/home/boss/work/boss/prepare-worktree.sh', args: ['wren', 'mwdlkxb56xr2ek89g92', 'prepare-worktree-the-command'] }])
  assert.equal(result.ok, true)
  assert.equal(result.path, '/srv/w/taskmanager-wren-mwdlkxb5')
  assert.equal(result.branch, 'wren/mwdlkxb56xr2ek89g92-prepare-worktree')
  assert.equal(result.db, 'arnotes_test_wren')
})

test('a project with no script gets a clear message, and nothing runs', () => {
  let ran = false
  const result = prepareWorktree({ who: 'wren', taskId: 'x', title: 'x', config: {}, runner: () => { ran = true; return { status: 0, stdout: '', stderr: '' } } })
  assert.equal(result.ok, false)
  assert.match(result.message, /no prepareWorktree script in crew\.json/)
  assert.equal(ran, false)
})

test('a script that stops gives its exit code and what it said, and no result', () => {
  const result = prepareWorktree({ who: 'wren', taskId: 'x', title: 'x', config, runner: () => ({ status: 3, stdout: '', stderr: 'dirty worktree: refusing to reuse it' }) })
  assert.equal(result.ok, false)
  assert.match(result.message, /stopped \(exit 3\): dirty worktree/)
})

test('a script that prints no result line is reported, not guessed at', () => {
  const result = prepareWorktree({ who: 'wren', taskId: 'x', title: 'x', config, runner: () => ({ status: 0, stdout: 'done\n', stderr: '' }) })
  assert.equal(result.ok, false)
  assert.match(result.message, /printed no result line/)
})

test('the result line must be exactly the three fields, in order', () => {
  assert.deepEqual(parseResultLine('worktree /p branch b db d'), { path: '/p', branch: 'b', db: 'd' })
  assert.equal(parseResultLine('worktree /p branch b'), null)
  assert.equal(parseResultLine('branch b db d worktree /p'), null)
  assert.equal(parseResultLine(''), null)
})

test('slugs are short, lower case and dashed, and never empty', () => {
  assert.equal(slugOf('Crew kit: a Blocked card must say who unblocks it!'), 'crew-kit-a-blocked-card-must-say-who-unb')
  assert.equal(slugOf('   '), 'card')
  assert.equal(slugOf(undefined), 'card')
  assert.ok(slugOf('x'.repeat(200)).length <= 40)
})
