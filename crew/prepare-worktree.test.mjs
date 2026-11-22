// The kit side of `crew <who> prepare worktree <task-id>`: the arguments reach the project script, its one result line is
// read, and a missing script, a failing script or a malformed line each give a clear message. A fake runner stands in
// for the script, so no git, dependency or database work runs here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cardWorktrees, parseResultLine, prepareWorktree, removePlan, reservationFailure, slugOf, worktreeFolder, worktreeRowsIn } from './prepare-worktree.mjs'

test('a new worktree whose port cannot be reserved is removed only when it holds nothing; otherwise it is kept and says so', () => {
  const empty = reservationFailure({ created: true, dirty: false, aheadOfBase: 0, error: 'port 3101 is held', who: 'wren', taskId: 'mwdlkxb56xr2ek89g92' })
  assert.equal(empty.remove, true)
  assert.match(empty.message, /had nothing in it, so it was removed/)
  const dirty = reservationFailure({ created: true, dirty: true, aheadOfBase: 0, error: 'port 3101 is held', who: 'wren', taskId: 'mwdlkxb56xr2ek89g92' })
  assert.equal(dirty.remove, false)
  assert.match(dirty.message, /the worktree is kept because it has work in it/)
  assert.match(dirty.message, /crew wren prepare worktree mwdlkxb56xr2ek89g92/)
  const ahead = reservationFailure({ created: true, dirty: false, aheadOfBase: 2, error: 'x', who: 'wren', taskId: 't' })
  assert.equal(ahead.remove, false, 'commits beyond the default branch keep it')
  // A folder that was already there is a reused one: never removed, even when it is clean and empty.
  const reused = reservationFailure({ created: false, dirty: false, aheadOfBase: 0, error: 'x', who: 'wren', taskId: 't' })
  assert.equal(reused.remove, false, 'a reused folder is kept')
  assert.match(reused.message, /kept/)
})

test('the worktree folder comes from crew.json worktreeBase, and a missing or relative one is a clear error', () => {
  const missing = worktreeFolder({ config: {}, who: 'wren', taskId: 'mwdlkxb56xr2ek89g92' })
  assert.equal(missing.ok, false)
  assert.match(missing.message, /crew\.json has no worktreeBase \(an absolute folder\)/)
  assert.equal(missing.message.includes('\n'), false, 'one line')
  assert.equal(worktreeFolder({ config: { worktreeBase: 'relative/dir' }, who: 'wren', taskId: 'x' }).ok, false)
  assert.equal(worktreeFolder({ config: null, who: 'wren', taskId: 'x' }).ok, false)
  const set = worktreeFolder({ config: { worktreeBase: '/srv/agents/taskmanager-maintenance/' }, who: 'wren', taskId: 'mwdlkxb56xr2ek89g92' })
  assert.deepEqual(set, { ok: true, path: '/srv/agents/taskmanager-maintenance/taskmanager-wren-mwdlkxb5' })
})

test('a worktree is removed only when it is clean and its branch is on origin with nothing ahead', () => {
  assert.equal(removePlan({ dirty: false, branchPushed: true, aheadOfRemote: 0 }).ok, true)
  assert.equal(removePlan({ dirty: true, branchPushed: true, aheadOfRemote: 0 }).ok, false, 'uncommitted changes refuse')
  assert.equal(removePlan({ dirty: false, branchPushed: false, aheadOfRemote: 0 }).ok, false, 'a branch not on origin refuses')
  const ahead = removePlan({ dirty: false, branchPushed: true, aheadOfRemote: 2 })
  assert.equal(ahead.ok, false)
  assert.match(ahead.message, /2 commit\(s\) ahead of origin/)
})

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
  const runner = () => {
    ran = true
    return { status: 0, stdout: '', stderr: '' }
  }
  const result = prepareWorktree({ who: 'wren', taskId: 'x', title: 'x', config: {}, runner })
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

// A card that already has its own worktree and branch (Wynn's report, mwlgeaodug4zu87rmb): the script looks only for the folder
// <base>/taskmanager-<who>-<first 8>, so a worktree under another folder name would get a second branch. The kit finds the
// card's worktrees from the branches (who/<task-id>-...) and reuses the one, or stops naming them when there are several.
const LIST = [
  { path: '/srv/w/taskmanager-wynn-mwj3kbtt', branch: 'wynn/mwjfx58bi6p4dqqeo8-invite-by-email-part-2' },
  { path: '/srv/w/taskmanager-wynn-mwc4jn0g', branch: 'wynn/mwc4jn0gxxxxxxxxxxxxxx-other-card' },
  { path: '/srv/w/taskmanager-wynn-mwjfx58b', branch: 'wynn/mwjfx58bi6p4dqqeo8-invite-by-email-part-2-the-project-share' },
  { path: '/srv/w/taskmanager-wren-mwjfx58b', branch: 'wren/mwjfx58bi6p4dqqeo8-someone-elses' }
]

test('the card’s worktrees are found by their branch, whatever the folder is called, and another card’s or another person’s are not', () => {
  const found = cardWorktrees(LIST, { who: 'wynn', taskId: 'mwjfx58bi6p4dqqeo8' })
  assert.deepEqual(found.map(row => row.path), ['/srv/w/taskmanager-wynn-mwj3kbtt', '/srv/w/taskmanager-wynn-mwjfx58b'])
  assert.deepEqual(cardWorktrees(LIST, { who: 'wynn', taskId: 'nosuchcard00000000000' }), [])
})

test('a card that already has one worktree is reused: the script does not run, and the existing path and branch are returned', () => {
  const calls = []
  const runner = (script, args) => {
    calls.push({ script, args })
    return { status: 0, stdout: 'worktree /srv/w/new branch wynn/x db arnotes_test_wynn\n', stderr: '' }
  }
  const one = [{ path: '/srv/w/taskmanager-wynn-mwj3kbtt', branch: 'wynn/mwjfx58bi6p4dqqeo8-invite-by-email-part-2' }]
  const result = prepareWorktree({ who: 'wynn', taskId: 'mwjfx58bi6p4dqqeo8', title: 'x', config, runner, existing: one })
  assert.deepEqual(calls, [], 'no second worktree is made')
  assert.equal(result.ok, true)
  assert.equal(result.path, '/srv/w/taskmanager-wynn-mwj3kbtt')
  assert.equal(result.branch, 'wynn/mwjfx58bi6p4dqqeo8-invite-by-email-part-2')
  assert.equal(result.db, 'arnotes_test_wynn')
})

test('a card with several worktrees stops and names them all: nothing is made, nothing is guessed', () => {
  const calls = []
  const runner = (script, args) => {
    calls.push({ script, args })
    return { status: 0, stdout: '', stderr: '' }
  }
  const result = prepareWorktree({ who: 'wynn', taskId: 'mwjfx58bi6p4dqqeo8', title: 'x', config, runner, existing: LIST.slice(0, 3) })
  assert.deepEqual(calls, [])
  assert.equal(result.ok, false)
  assert.match(result.message, /taskmanager-wynn-mwj3kbtt/)
  assert.match(result.message, /taskmanager-wynn-mwjfx58b/)
  assert.match(result.message, /more than one worktree/)
})

test('a card with no worktree yet runs the script as before', () => {
  const calls = []
  const runner = (script, args) => {
    calls.push({ script, args })
    return { status: 0, stdout: 'worktree /srv/w/taskmanager-wynn-mwnew000 branch wynn/mwnew000-x db arnotes_test_wynn\n', stderr: '' }
  }
  const result = prepareWorktree({ who: 'wynn', taskId: 'mwnew000', title: 'x', config, runner, existing: [] })
  assert.equal(calls.length, 1)
  assert.equal(result.ok, true)
})

// The scan of the worktree base (crew/prepare-worktree-cli.mjs passes its rows in). A missing or empty base is an empty list,
// never an error; a worktree is listed whatever its folder is called, and the branch decides which card it is.
test('a missing worktree base gives an empty list, not an error', () => {
  const missing = join(mkdtempSync(join(tmpdir(), 'wt-base-')), 'does-not-exist')
  assert.deepEqual(worktreeRowsIn(missing, { branchOf: () => 'wynn/mwx-y' }), [])
  assert.deepEqual(worktreeRowsIn('', { branchOf: () => 'wynn/mwx-y' }), [])
})

test('an empty worktree base gives an empty list', () => {
  const base = mkdtempSync(join(tmpdir(), 'wt-base-'))
  assert.deepEqual(worktreeRowsIn(base, { branchOf: () => 'wynn/mwx-y' }), [])
})

test('every folder under the base is listed with its branch, whatever its name, and cardWorktrees picks the card by branch', () => {
  const base = mkdtempSync(join(tmpdir(), 'wt-base-'))
  mkdirSync(join(base, 'taskmanager-wynn-mwjfx58b'))
  mkdirSync(join(base, 'some-old-folder-name'))
  const branches = {
    [join(base, 'taskmanager-wynn-mwjfx58b')]: 'wynn/mwjfx58bi6p4dqqeo8-invite-by-email-part-2',
    [join(base, 'some-old-folder-name')]: 'wynn/mwjfx58bi6p4dqqeo8-invite-by-email-part-2-old'
  }
  const rows = worktreeRowsIn(base, { branchOf: path => branches[path] ?? '' })
  assert.equal(rows.length, 2, 'both folders are listed, the name is not the filter')
  const found = cardWorktrees(rows, { who: 'wynn', taskId: 'mwjfx58bi6p4dqqeo8' })
  assert.deepEqual(found.map(row => row.path).sort(), [join(base, 'some-old-folder-name'), join(base, 'taskmanager-wynn-mwjfx58b')].sort())
})
