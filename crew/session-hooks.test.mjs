// session-hooks.mjs: excludeFromGit keeps a settings file out of git for a normal checkout and for a git worktree
// (whose .git is a file), and says nothing for a folder that is not a checkout. Each test works in throwaway folders
// it removes itself, with real git. Run:
//   node --test crew/session-hooks.test.mjs
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const ENTRY = '.claude/settings.local.json'
const root = mkdtempSync(join(tmpdir(), 'session-hooks-test-'))
const crewHome = join(root, 'crew-home')
mkdirSync(crewHome, { recursive: true })
writeFileSync(join(crewHome, 'crew.json'), JSON.stringify({ team: 'test', people: {}, nicks: {} }))
process.env.CREW_HOME = crewHome

let excludeFromGit, gitExcludeFile
before(async () => {
  ({ excludeFromGit, gitExcludeFile } = await import('./session-hooks.mjs'))
})

const git = (cwd, args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' })

function repo() {
  const dir = mkdtempSync(join(root, 'repo-'))
  git(dir, ['init', '-q'])
  writeFileSync(join(dir, 'README'), 'x\n')
  git(dir, ['add', 'README'])
  git(dir, ['commit', '-q', '-m', 'init'])
  return dir
}

test('a normal checkout: the entry goes to .git/info/exclude once, and git ignores the file', () => {
  const dir = repo()
  try {
    assert.equal(excludeFromGit(dir, ENTRY), true)
    assert.equal(excludeFromGit(dir, ENTRY), false, 'no second line')
    assert.match(readFileSync(join(dir, '.git', 'info', 'exclude'), 'utf8'), /\.claude\/settings\.local\.json/)
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(join(dir, ENTRY), '{}')
    assert.equal(git(dir, ['check-ignore', '-q', ENTRY]).status, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a worktree: the entry goes to the shared exclude, and git ignores the file in the worktree', () => {
  const main = repo()
  const wt = join(root, 'wt-' + Math.random().toString(36).slice(2))
  try {
    assert.equal(git(main, ['worktree', 'add', '-q', '-b', 'side', wt]).status, 0)
    assert.equal(statSync(join(wt, '.git')).isFile(), true, '.git in a worktree is a file')
    assert.equal(excludeFromGit(wt, ENTRY), true)
    assert.equal(excludeFromGit(wt, ENTRY), false)
    assert.match(readFileSync(join(main, '.git', 'info', 'exclude'), 'utf8'), /\.claude\/settings\.local\.json/)
    mkdirSync(join(wt, '.claude'), { recursive: true })
    writeFileSync(join(wt, ENTRY), '{}')
    assert.equal(git(wt, ['check-ignore', '-q', ENTRY]).status, 0)
    assert.equal(gitExcludeFile(wt), join(main, '.git', 'info', 'exclude'))
  } finally {
    rmSync(wt, { recursive: true, force: true })
    rmSync(main, { recursive: true, force: true })
  }
})

after(() => rmSync(root, { recursive: true, force: true }))

test('a folder that is not a checkout gets no exclude and reports false', () => {
  const dir = mkdtempSync(join(root, 'plain-'))
  try {
    assert.equal(gitExcludeFile(dir), null)
    assert.equal(excludeFromGit(dir, ENTRY), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
