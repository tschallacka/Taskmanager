// Tests for Janet's cleanup rules, against a real throwaway git repository with worktrees.
// Run from the repo root: node --test crew/janet.test.mjs
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { assertRemovable, baseBranchOf, belongsToCrew, buildPlan, cardIdOf, checkIds, DONE, findWorktree, gatherFacts, GRANTED, inUseProbe, insideRoot, parseWorktrees, planHash, readScratchList, removeStep, renderPlan, runPlan, SCRATCH_LIST, scanWorktree, stalePlan, staleHoursOf, stepsOnBoard } from './janet.mjs'

const KIT = fileURLToPath(new URL('.', import.meta.url))
const PEOPLE = { boss: 'Boss', wren: 'Wren Worker', janet: 'Janet Janitor' }

const CARD = 'mw5bfva97wj7rn72ud4'

function git(args, cwd, env = {}) {
  const run = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } })
  return { status: run.status ?? 1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' }
}

// A repository on main with one tracked file, a work folder for worker "wren", and a worktree per scenario.
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'janet-'))
  const repo = join(root, 'repo')
  const work = join(root, 'crew', 'work', 'wren')
  mkdirSync(repo, { recursive: true })
  mkdirSync(work, { recursive: true })
  git(['init', '-q', '-b', 'main'], repo)
  writeFileSync(join(repo, 'tracked.txt'), 'hello\n')
  git(['add', '.'], repo)
  git(['commit', '-q', '-m', 'init'], repo, OLD_ENV)
  return { root, repo, work }
}

function addWorktree(repo, name, branch, { commit = false } = {}) {
  const path = join(repo, '..', name)
  git(['worktree', 'add', '-q', '-b', branch, path, 'main'], repo)
  if (commit) {
    writeFileSync(join(path, 'feature.txt'), 'work\n')
    git(['add', '.'], path)
    git(['commit', '-q', '-m', 'feature'], path)
  }
  return path
}

function plan(f, over = {}) {
  const entries = parseWorktrees(git(['worktree', 'list', '--porcelain'], f.repo).stdout)
  return buildPlan({
    who: 'wren',
    cardId: CARD,
    repoRoot: f.repo,
    workFolder: f.work,
    scratch: over.scratch ?? [],
    worktree: over.worktree === undefined ? findWorktree(entries, CARD, f.repo) : over.worktree,
    base: 'main',
    git,
    prState: over.prState ?? (() => 'none')
  })
}

test('the scratch list keeps paths, drops blanks and comments', () => {
  assert.deepEqual(readScratchList('a.png\n\n# note\n  b/c.txt \n'), ['a.png', 'b/c.txt'])
})

test('insideRoot is strict: the root itself and anything outside it are not inside', () => {
  assert.equal(insideRoot('/x/wt', '/x/wt'), false)
  assert.equal(insideRoot('/x/wt', '/x/wt/a/b'), true)
  assert.equal(insideRoot('/x/wt', '/x/other/a'), false)
})

test('a merged branch in its worktree is removed, with the worker\'s untracked scratch files first', () => {
  const f = fixture()
  const wt = addWorktree(f.repo, `wt-merged-${CARD}`, `wren/${CARD}-merged`)
  writeFileSync(join(wt, 'scratch.log'), 'x')
  writeFileSync(join(f.work, 'out.png'), 'png')
  writeFileSync(join(f.work, '.crew-scratch'), 'out.png\n')
  writeFileSync(join(wt, '.crew-scratch'), 'scratch.log\n')
  const p = plan(f, { scratch: ['out.png', join(wt, 'scratch.log')] })
  const kinds = p.steps.map(s => `${s.kind}:${s.target}`)
  assert.ok(kinds.includes(`file:${join(f.work, 'out.png')}`), 'the work-folder screenshot is a file step')
  assert.ok(kinds.includes(`file:${join(wt, 'scratch.log')}`), 'the untracked scratch file is a file step, not dirt')
  assert.ok(kinds.includes(`worktree:${wt}`), 'the merged worktree is removed')
  assert.ok(kinds.includes(`branch:wren/${CARD}-merged`), 'its merged branch is deleted')
  assert.deepEqual(p.refused, [])
})

test('an unmerged branch is not removed, and says why', () => {
  const f = fixture()
  const wt = addWorktree(f.repo, `wt-unmerged-${CARD}`, `wren/${CARD}-unmerged`, { commit: true })
  const p = plan(f)
  assert.ok(!p.steps.some(s => s.kind === 'worktree' || s.kind === 'branch'), 'no worktree or branch step')
  assert.ok(p.refused.some(r => r.target === `wren/${CARD}-unmerged` && r.reason.includes('not merged')), 'refused as unmerged')
  assert.ok(existsSync(wt), 'the worktree is still there')
})

test('a branch with an open pull request is not removed, even when merged', () => {
  const f = fixture()
  addWorktree(f.repo, `wt-pr-${CARD}`, `wren/${CARD}-pr`)
  const p = plan(f, { prState: () => 'open' })
  assert.ok(!p.steps.some(s => s.kind === 'worktree' || s.kind === 'branch'))
  assert.ok(p.refused.some(r => r.reason.includes('open pull request')))
})

test('an unknown pull request state keeps the branch (GitHub unreachable is not a yes)', () => {
  const f = fixture()
  addWorktree(f.repo, `wt-unk-${CARD}`, `wren/${CARD}-unk`)
  const p = plan(f, { prState: () => 'unknown' })
  assert.ok(!p.steps.some(s => s.kind === 'worktree'))
  assert.ok(p.refused.some(r => r.reason.includes('unknown')))
})

test('a file outside the worker\'s own folders is a foreign file and is never deleted', () => {
  const f = fixture()
  const foreign = join(f.root, 'someone-else.txt')
  writeFileSync(foreign, 'theirs')
  const p = plan(f, { scratch: [foreign] })
  assert.ok(!p.steps.some(s => s.target === foreign), 'no step for the foreign file')
  assert.ok(p.refused.some(r => r.target === foreign && r.reason.includes('outside')))
  assert.ok(existsSync(foreign))
})

test('a tracked repository file on the scratch list is never deleted', () => {
  const f = fixture()
  const wt = addWorktree(f.repo, `wt-tracked-${CARD}`, `wren/${CARD}-tracked`)
  const p = plan(f, { scratch: [join(wt, 'tracked.txt')] })
  assert.ok(!p.steps.some(s => s.target.endsWith('tracked.txt')))
  assert.ok(p.refused.some(r => r.reason.includes('tracked')))
})

test('the shared checkout is never a worktree to remove', () => {
  const f = fixture()
  const p = plan(f, { worktree: { path: f.repo, branch: 'main' } })
  assert.ok(!p.steps.some(s => s.kind === 'worktree' || s.kind === 'branch'))
  assert.ok(p.refused.some(r => r.reason.includes('shared')))
})

test('a symbolic link on the scratch list is not followed or deleted', () => {
  const f = fixture()
  const target = join(f.root, 'real.txt')
  writeFileSync(target, 'keep')
  symlinkSync(target, join(f.work, 'link.txt'))
  const p = plan(f, { scratch: ['link.txt'] })
  assert.ok(!p.steps.some(s => s.kind === 'file'))
  assert.ok(existsSync(target))
})

test('the plan renders numbered steps and what was left, with a hash', () => {
  const f = fixture()
  writeFileSync(join(f.work, 'a.png'), 'x')
  const text = renderPlan(plan(f, { scratch: ['a.png'] }))
  assert.match(text, /^1\. \[step\] browser: wren/m)
  assert.match(text, /plan hash: [0-9a-f]{16}/)
})

test('the hash changes with the steps, and stays the same for the same steps', () => {
  const a = [{ kind: 'file', target: '/x/a' }]
  assert.equal(planHash(a), planHash([{ kind: 'file', target: '/x/a', reason: 'other reason' }]), 'the reason is not part of the hash')
  assert.notEqual(planHash(a), planHash([{ kind: 'file', target: '/x/b' }]))
})

// The board stand-in for runPlan: the plan subtask with its tags and its step subtasks.
function board(tags, steps) {
  const calls = []
  return {
    calls,
    getTask: () => ({ id: 'plan-1', tags, subtasks: steps.map((s, i) => ({ id: `s${i}`, title: `[step] ${s.kind}: ${s.target}` })) }),
    updateTask: (id, patch) => calls.push(['update', id, patch]),
    postUpdate: (id, text) => calls.push(['post', id, text])
  }
}

test('no deletion without cleaning granted on the plan', () => {
  const f = fixture()
  writeFileSync(join(f.work, 'a.png'), 'x')
  const p = plan(f, { scratch: ['a.png'] })
  const b = board([], p.steps)
  const executed = []
  assert.throws(() => runPlan({ plan: { ...p, planId: 'plan-1' }, board: b, dryRun: false, execute: s => executed.push(s), log: () => {} }), /cleaning granted/)
  assert.equal(executed.length, 0)
  assert.ok(existsSync(join(f.work, 'a.png')))
})

test('a granted plan whose steps changed since the grant is refused', () => {
  const f = fixture()
  writeFileSync(join(f.work, 'a.png'), 'x')
  const p = plan(f, { scratch: ['a.png'] })
  const b = board([GRANTED], [{ kind: 'browser', target: 'wren' }])
  const executed = []
  assert.throws(() => runPlan({ plan: { ...p, planId: 'plan-1' }, board: b, dryRun: false, execute: s => executed.push(s), log: () => {} }), /plan changed/)
  assert.equal(executed.length, 0)
})

test('a dry run prints the steps and deletes nothing', () => {
  const f = fixture()
  writeFileSync(join(f.work, 'a.png'), 'x')
  const p = plan(f, { scratch: ['a.png'] })
  const b = board([GRANTED], p.steps)
  const lines = []
  const executed = []
  runPlan({ plan: { ...p, planId: 'plan-1' }, board: b, dryRun: true, execute: s => executed.push(s), log: l => lines.push(l) })
  assert.equal(executed.length, 0)
  assert.equal(b.calls.length, 0, 'no board writes in a dry run')
  assert.ok(lines.every(l => l.startsWith('would do')))
  assert.ok(existsSync(join(f.work, 'a.png')))
})

test('a granted, unchanged plan runs its steps in order, ticks each one and marks the plan done', () => {
  const f = fixture()
  writeFileSync(join(f.work, 'a.png'), 'x')
  const p = plan(f, { scratch: ['a.png'] })
  const b = board([GRANTED], p.steps)
  const executed = []
  runPlan({ plan: { ...p, planId: 'plan-1' }, board: b, dryRun: false, execute: s => executed.push(s.kind), log: () => {} })
  assert.deepEqual(executed, p.steps.map(s => s.kind))
  assert.ok(b.calls.some(c => c[0] === 'update' && c[2].completed === true))
  assert.ok(b.calls.some(c => c[0] === 'update' && (c[2].tags ?? []).includes(DONE)))
})

test('the board steps are read from the subtask titles', () => {
  const steps = stepsOnBoard({ subtasks: [{ id: 'x', title: '[step] file: /a/b' }, { id: 'y', title: 'other' }] })
  assert.deepEqual(steps, [{ kind: 'file', target: '/a/b', id: 'x' }])
})

test('the ids from the command line are checked before any path is built', () => {
  assert.ok(checkIds('..', CARD, PEOPLE), 'a `..` who')
  assert.ok(checkIds('wren/../..', CARD, PEOPLE), 'a who with a slash')
  assert.ok(checkIds('Wren', CARD, PEOPLE), 'an upper-case who')
  assert.ok(checkIds('janet', CARD, PEOPLE), 'Janet herself')
  assert.ok(checkIds('ghost', CARD, PEOPLE), 'not a person of this crew')
  assert.ok(checkIds('wren', 'mw5/../x', PEOPLE), 'a card id with a slash')
  assert.ok(checkIds('wren', 'mw5-x', PEOPLE), 'a card id with a dash')
  assert.equal(checkIds('wren', CARD, PEOPLE), null)
})

test('the command line refuses a `..` who with exit 2, before reading any folder, and deletes nothing', () => {
  const f = fixture()
  const home = mkdtempSync(join(tmpdir(), 'janet-home-'))
  writeFileSync(join(home, 'crew.json'), JSON.stringify({ product: { repo: f.repo }, people: PEOPLE }))
  const canary = join(f.root, 'canary.txt')
  writeFileSync(canary, 'keep')
  const run = spawnSync(process.execPath, [join(KIT, 'janet.mjs'), 'clean', 'run', '..', CARD], { encoding: 'utf8', env: { ...process.env, CREW_HOME: home } })
  assert.equal(run.status, 2)
  assert.match(run.stderr, /refused/)
  assert.ok(existsSync(canary))
})

test('a target swapped for a symlink after the plan is refused at removal, and the link\'s target is not touched', () => {
  const f = fixture()
  const target = join(f.work, 'a.png')
  writeFileSync(target, 'x')
  const p = plan(f, { scratch: ['a.png'] })
  const step = p.steps.find(s => s.target === target)
  assert.doesNotThrow(() => assertRemovable(step, [f.work]), 'still a plain file at removal time')
  const outside = join(f.root, 'outside.txt')
  writeFileSync(outside, 'theirs')
  unlinkSync(target)
  symlinkSync(outside, target)
  assert.throws(() => assertRemovable(step, [f.work]), /symbolic link/)
  assert.equal(readFileSync(outside, 'utf8'), 'theirs')
})

test('a target that is outside the worker\'s folders at removal time is refused', () => {
  const f = fixture()
  const outside = join(f.root, 'outside.txt')
  writeFileSync(outside, 'theirs')
  assert.throws(() => assertRemovable({ kind: 'file', target: outside }, [f.work]), /outside the worker/)
  assert.ok(existsSync(outside))
})

test('a target that is no longer the kind the plan named is refused at removal time', () => {
  const f = fixture()
  const target = join(f.work, 'a.png')
  writeFileSync(target, 'x')
  assert.throws(() => assertRemovable({ kind: 'dir', target }, [f.work]), /no longer a dir/)
})

test('the base branch is the origin default, else main, else master, else an error', () => {
  const f = fixture()
  assert.equal(baseBranchOf(f.repo, git), 'main')

  git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/develop'], f.repo)
  assert.equal(baseBranchOf(f.repo, git), 'develop', 'origin\'s default wins when it is set')
  git(['symbolic-ref', '--delete', 'refs/remotes/origin/HEAD'], f.repo)

  const onlyMaster = mkdtempSync(join(tmpdir(), 'janet-master-'))
  git(['init', '-q', '-b', 'master'], onlyMaster)
  writeFileSync(join(onlyMaster, 'x'), 'x')
  git(['add', '.'], onlyMaster)
  git(['commit', '-q', '-m', 'init'], onlyMaster)
  assert.equal(baseBranchOf(onlyMaster, git), 'master', 'master when there is no main')

  const trunk = mkdtempSync(join(tmpdir(), 'janet-trunk-'))
  git(['init', '-q', '-b', 'trunk'], trunk)
  writeFileSync(join(trunk, 'x'), 'x')
  git(['add', '.'], trunk)
  git(['commit', '-q', '-m', 'init'], trunk)
  assert.throws(() => baseBranchOf(trunk, git), /no base branch/)
})

// ── Stale worktrees ──────────────────────────────────────────────────────────
const DAY = 24 * 3600 * 1000
const OLD = '2020-01-01T00:00:00Z'
const OLD_MS = Date.parse(OLD)
const OLD_DATE = new Date(OLD)
const OLD_ENV = { GIT_AUTHOR_DATE: OLD, GIT_COMMITTER_DATE: OLD }

// A worktree of the stale tests: `repo-<label>` beside the repository, so it belongs to the crew. `commit` makes one
// commit on it, dated by `commitEnv` (OLD for a stale one, nothing for a fresh one).
function staleWorktree(f, label, branch, { commit = false, commitEnv = {} } = {}) {
  const path = join(f.root, `repo-${label}`)
  git(['worktree', 'add', '-q', '-b', branch, path, 'main'], f.repo)
  if (commit) {
    writeFileSync(join(path, `${label}.txt`), 'work\n')
    git(['add', '.'], path)
    git(['commit', '-q', '-m', label], path, commitEnv)
  }
  return path
}

// The stale plan of every crew worktree in the fixture. The card's last update is OLD unless `cardMs` says otherwise.
function stalePlanOf(f, { cardMs = OLD_MS, now = Date.now(), staleMs = DAY, prState = () => 'none', inUse = () => false } = {}) {
  const base = 'main'
  const entries = parseWorktrees(git(['worktree', 'list', '--porcelain'], f.repo).stdout)
  return stalePlan({
    entries,
    repoRoot: f.repo,
    base,
    crewHome: join(f.root, 'crew'),
    now,
    staleMs,
    facts: entry => gatherFacts(entry, { repoRoot: f.repo, base, git, cardUpdated: () => cardMs, inUse }),
    prState
  })
}

function scanOf(path) {
  return scanWorktree(path, git)
}

test('the stale age is configurable in crew.json, a day by default', () => {
  assert.equal(staleHoursOf({}), 24)
  assert.equal(staleHoursOf({ janet: { staleHours: 2 } }), 2)
  assert.throws(() => staleHoursOf({ janet: { staleHours: 0 } }), /above 0/)
  assert.throws(() => staleHoursOf({ janet: { staleHours: 'day' } }), /above 0/)
})

test('only the crew\'s worktrees belong to Janet: inside the crew home, or beside the repository and named after it', () => {
  const crew = '/x/crew'
  assert.equal(belongsToCrew('/x/crew/publish/src', '/x/arnotes', crew), true)
  assert.equal(belongsToCrew('/x/arnotes-wick-abc', '/x/arnotes', crew), true)
  assert.equal(belongsToCrew('/x/elsewhere', '/x/arnotes', crew), false)
  assert.equal(belongsToCrew('/x/arnotes', '/x/arnotes', crew), false)
})

test('the card of a worktree is read from its branch or its folder name', () => {
  assert.equal(cardIdOf({ branch: `wick/${CARD}-janet`, path: '/x/arnotes-wick' }), CARD)
  assert.equal(cardIdOf({ branch: 'wren/x', path: '/x/arnotes-wren-mw6spyb' }), 'mw6spyb')
  assert.equal(cardIdOf({ branch: 'wren/x', path: '/x/arnotes-wren' }), null)
})

test('a merged, clean, stale worktree goes with its branch; a fresh one stays', () => {
  const f = fixture()
  const stale = staleWorktree(f, 'merged', 'wren/stale-merged')
  const fresh = staleWorktree(f, 'fresh', 'wren/stale-fresh', { commit: true })
  const p = stalePlanOf(f)
  assert.ok(p.steps.some(s => s.kind === 'worktree' && s.target === stale), 'the stale worktree is removed')
  assert.ok(p.steps.some(s => s.kind === 'branch' && s.target === 'wren/stale-merged'), 'its merged branch is deleted')
  assert.ok(!p.steps.some(s => s.target === fresh), 'the fresh worktree is not touched')
  assert.ok(p.refused.some(r => r.target === fresh && r.reason.startsWith('fresh')))
})

test('a merged branch with an open pull request keeps its branch, the folder still goes', () => {
  const f = fixture()
  const wt = staleWorktree(f, 'pr', 'wren/stale-pr')
  const p = stalePlanOf(f, { prState: () => 'open' })
  assert.ok(p.steps.some(s => s.kind === 'worktree' && s.target === wt))
  assert.ok(!p.steps.some(s => s.kind === 'branch'))
  assert.ok(p.refused.some(r => r.reason === 'kept: open pull request'))
})

test('the shared checkout and the main branch are never planned', () => {
  const f = fixture()
  staleWorktree(f, 'other', 'wren/stale-other')
  const p = stalePlanOf(f)
  assert.ok(!p.steps.some(s => resolve(s.target) === resolve(f.repo)), 'the shared checkout is never a step')
  assert.ok(!p.steps.some(s => s.kind === 'branch' && PROTECTED_NAMES.includes(s.target)), 'main is never a branch step')
})

const PROTECTED_NAMES = ['main', 'master', 'develop']

test('a card that cannot be read keeps its worktree, since the idle time is then unknown', () => {
  const f = fixture()
  const wt = staleWorktree(f, 'cardless', `wren/${CARD}-cardless`)
  const p = stalePlanOf(f, { cardMs: null })
  assert.ok(!p.steps.some(s => s.target === wt))
  assert.ok(p.refused.some(r => r.target === wt && r.reason.includes('cannot be read')))
})

test('the age decides: the same worktree is fresh under a longer stale age', () => {
  const f = fixture()
  const wt = staleWorktree(f, 'age', 'wren/stale-age')
  assert.ok(stalePlanOf(f).steps.some(s => s.target === wt))
  assert.ok(!stalePlanOf(f, { staleMs: 10000 * DAY }).steps.some(s => s.target === wt))
})

test('a worktree with a working process in it is in use, and kept', () => {
  const f = fixture()
  const wt = staleWorktree(f, 'inuse', 'wren/stale-inuse')
  const p = stalePlanOf(f, { inUse: () => true })
  assert.ok(!p.steps.some(s => s.target === wt))
  assert.ok(p.refused.some(r => r.target === wt && r.reason.includes('in use')))
})

test('a process started in a worktree is seen by the probe', { skip: !existsSync('/proc') && 'needs /proc' }, async () => {
  const f = fixture()
  const wt = staleWorktree(f, 'busy', 'wren/stale-busy')
  const child = spawn('sleep', ['30'], { cwd: wt })
  try {
    let seen = false
    for (let i = 0; i < 40 && !seen; i++) {
      seen = inUseProbe(wt) === true
      if (!seen) await new Promise(resolveWait => setTimeout(resolveWait, 50))
    }
    assert.equal(seen, true)
  } finally {
    child.kill()
  }
})

test('an untracked file that is not on the scratch list keeps the worktree, and is left alone', () => {
  const f = fixture()
  const wt = staleWorktree(f, 'untracked', 'wren/stale-untracked')
  const stray = join(wt, 'notes.txt')
  writeFileSync(stray, 'mine')
  utimesSync(stray, OLD_DATE, OLD_DATE)
  const p = stalePlanOf(f)
  assert.ok(!p.steps.some(s => s.target === wt), 'no worktree step')
  assert.ok(p.refused.some(r => r.target === wt && r.reason.includes('uncommitted work') && r.reason.includes('notes.txt')))
  assert.equal(readFileSync(stray, 'utf8'), 'mine')
})

test('an untracked file on the scratch list goes with its worktree, and nothing else does', () => {
  const f = fixture()
  const wt = staleWorktree(f, 'scratch', 'wren/stale-scratch')
  const shot = join(wt, 'shot.png')
  const list = join(wt, SCRATCH_LIST)
  writeFileSync(shot, 'png')
  writeFileSync(list, 'shot.png\n')
  utimesSync(shot, OLD_DATE, OLD_DATE)
  utimesSync(list, OLD_DATE, OLD_DATE)
  const p = stalePlanOf(f)
  assert.ok(p.steps.some(s => s.kind === 'file' && s.target === shot), 'the scratch file is a file step')
  assert.ok(p.steps.some(s => s.kind === 'file' && s.target === list), 'the scratch list goes with it')
  assert.ok(p.steps.some(s => s.kind === 'worktree' && s.target === wt))
  assert.deepEqual(p.refused.filter(r => r.target === wt), [])
})

test('a dirty tracked file keeps the worktree, and says so', () => {
  const f = fixture()
  const wt = staleWorktree(f, 'dirty', 'wren/stale-dirty')
  const tracked = join(wt, 'tracked.txt')
  writeFileSync(tracked, 'changed\n')
  utimesSync(tracked, OLD_DATE, OLD_DATE)
  const p = stalePlanOf(f)
  assert.ok(!p.steps.some(s => s.kind === 'worktree' && s.target === wt), 'no worktree step')
  assert.ok(p.refused.some(r => r.target === wt && r.reason.startsWith('needs the worker: uncommitted work') && r.reason.includes('tracked.txt')))
  assert.ok(existsSync(wt))
})

test('a committed branch that is not pushed keeps its branch, and the folder goes', () => {
  const f = fixture()
  const wt = staleWorktree(f, 'unpushed', 'wren/stale-unpushed', { commit: true, commitEnv: OLD_ENV })
  const p = stalePlanOf(f)
  assert.ok(p.steps.some(s => s.kind === 'worktree' && s.target === wt), 'the folder is removable')
  assert.ok(!p.steps.some(s => s.kind === 'branch'), 'no branch step')
  assert.ok(p.refused.some(r => r.target === 'wren/stale-unpushed' && r.reason === 'kept: unpushed commits on wren/stale-unpushed'))
})

test('a worktree that becomes dirty between the plan and the run is skipped, not removed', () => {
  const f = fixture()
  const wt = staleWorktree(f, 'late', 'wren/stale-late')
  const p = stalePlanOf(f)
  const index = p.steps.findIndex(s => s.kind === 'worktree' && s.target === wt)
  assert.ok(index >= 0, 'planned for removal')
  writeFileSync(join(wt, 'typed-after-plan.txt'), 'new work')
  const b = board([GRANTED], p.steps)
  const result = runPlan({
    plan: { ...p, planId: 'plan-1' },
    board: b,
    dryRun: false,
    execute: step => removeStep(step, { roots: p.roots, repoRoot: f.repo, git, inUse: () => false, scan: scanOf }),
    log: () => {}
  })
  assert.ok(result.skipped.some(reason => reason.includes('uncommitted work')), 'the skip says why')
  assert.ok(existsSync(wt), 'the folder is still there')
  assert.equal(readFileSync(join(wt, 'typed-after-plan.txt'), 'utf8'), 'new work')
  assert.ok(!b.calls.some(c => c[0] === 'update' && c[1] === `s${index}` && c[2].completed === true), 'the step is not ticked')
})

test('a stale plan whose steps changed since the grant is refused by the hash', () => {
  const f = fixture()
  staleWorktree(f, 'hash', 'wren/stale-hash')
  const p = stalePlanOf(f)
  assert.ok(p.steps.length > 0)
  const executed = []
  assert.throws(() => runPlan({
    plan: { ...p, planId: 'plan-1' },
    board: board([GRANTED], [{ kind: 'branch', target: 'somewhere-else' }]),
    dryRun: false,
    execute: s => executed.push(s),
    log: () => {}
  }), /plan changed/)
  assert.equal(executed.length, 0)
})

test('the stale dry run prints the plan, posts nothing and removes nothing (no board: the card is unreadable, so kept)', () => {
  const f = fixture()
  const wt = staleWorktree(f, 'cli', `wren/${CARD}-cli`)
  const home = mkdtempSync(join(tmpdir(), 'janet-stale-home-'))
  writeFileSync(join(home, 'crew.json'), JSON.stringify({ product: { repo: f.repo }, people: PEOPLE }))
  const run = spawnSync(process.execPath, [join(KIT, 'janet.mjs'), 'stale', 'plan', CARD, '--dry-run'], { encoding: 'utf8', env: { ...process.env, CREW_HOME: home } })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /dry run: nothing posted/)
  assert.match(run.stdout, /cannot be read/)
  assert.ok(existsSync(wt), 'the worktree is still there')
})
