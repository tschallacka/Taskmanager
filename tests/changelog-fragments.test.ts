// scripts/bump-version.mjs: the changelog fragments in changelog.d/ and their fold into CHANGELOG.md. Each test
// works in a throwaway folder under tests/ (removed afterwards), never in the real repository. The merge tests use
// a throwaway git repository in that folder. Run:
//   node --import tsx --test tests/changelog-fragments.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = process.cwd()
const SCRIPT = join(ROOT, 'scripts', 'bump-version.mjs')

// A folder under tests/ that the test removes itself.
function scratch(): string {
  return mkdtempSync(join(ROOT, 'tests', 'changelog-fragments-scratch-'))
}

function write(dir: string, file: string, text: string) {
  mkdirSync(dirname(join(dir, file)), { recursive: true })
  writeFileSync(join(dir, file), text)
}

const read = (dir: string, file: string) => readFileSync(join(dir, file), 'utf8')

// The fragment files that are left in changelog.d (only *.md counts).
function fragments(dir: string): string[] {
  const folder = join(dir, 'changelog.d')
  return existsSync(folder) ? readdirSync(folder).filter(name => name.endsWith('.md')).sort() : []
}

// The script runs in a folder laid out like the repository, with the files its version copies name.
function layout(dir: string, version: string) {
  copyFileSync(SCRIPT, join(dir, 'scripts', 'bump-version.mjs'))
  write(dir, 'package.json', `{\n  "name": "arnotes",\n  "version": "${version}",\n  "private": true\n}\n`)
  write(dir, 'nix/arnotes.nix', '{\n}\n')
  write(dir, 'nix/packages.nix', '{\n}\n')
  write(dir, 'nix/schema.nix', '{\n}\n')
  write(dir, 'server/api/mcp/index.post.ts', 'const SERVER_NAME = \'Taskmanager\'\n')
  write(dir, 'CHANGELOG.md', '# Changelog\n\nAll notable changes to Arnotes are documented in this file.\n\n## 0.1.0 - 2026-07-28\n\nInitial open-source release.\n\n- Self-hosted notes\n')
}

// Runs the script with a clean git environment, as the bump tests do.
function run(dir: string, args: string[], input?: string) {
  const env = { ...process.env }
  delete env.GIT_DIR
  delete env.GIT_WORK_TREE
  delete env.GIT_INDEX_FILE
  const result = spawnSync(process.execPath, [join(dir, 'scripts', 'bump-version.mjs'), ...args], { cwd: dir, env, encoding: 'utf8', input })
  return { status: result.status, out: result.stdout, err: result.stderr }
}

function cleanup(folder: string) {
  rmSync(folder, { recursive: true, force: true })
}

function withFolder(body: (dir: string) => void) {
  const dir = scratch()
  try {
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    body(dir)
  } finally {
    cleanup(dir)
  }
}

test('a bump folds the fragments under the new version, newest first, and deletes them', () => {
  withFolder((dir) => {
    layout(dir, '0.1.0')
    write(dir, 'changelog.d/card2-second.md', '- **Second.** Its detail.\n')
    write(dir, 'changelog.d/card1-first.md', '- **First.** Its detail.\n')
    const result = run(dir, ['patch'])
    assert.equal(result.status, 0, result.err)
    assert.match(result.out, /changelog\.d: 2 fragments folded into CHANGELOG\.md under 0\.1\.1/)
    assert.match(
      read(dir, 'CHANGELOG.md'),
      /^## 0\.1\.1 - \d{4}-\d{2}-\d{2}\n\n- \*\*First\.\*\* Its detail\.\n\n- \*\*Second\.\*\* Its detail\.\n\n## 0\.1\.0 - 2026-07-28\n/m
    )
    assert.deepEqual(fragments(dir), [])
    assert.match(read(dir, 'package.json'), /"version": "0\.1\.1"/)
  })
})

test('a bump with no fragments leaves CHANGELOG.md as it is', () => {
  withFolder((dir) => {
    layout(dir, '0.1.0')
    const before = read(dir, 'CHANGELOG.md')
    const result = run(dir, ['feature'])
    assert.equal(result.status, 0, result.err)
    assert.doesNotMatch(result.out, /changelog\.d/)
    assert.equal(read(dir, 'CHANGELOG.md'), before)
  })
})

test('the changelog mode folds under the version package.json has, and --dry-run writes nothing', () => {
  withFolder((dir) => {
    layout(dir, '0.2.0')
    write(dir, 'changelog.d/card1-first.md', '- **First.** Its detail.\n')
    const dry = run(dir, ['changelog', '--dry-run'])
    assert.equal(dry.status, 0, dry.err)
    assert.match(dry.out, /dry run: nothing written/)
    assert.deepEqual(fragments(dir), ['card1-first.md'])
    assert.doesNotMatch(read(dir, 'CHANGELOG.md'), /## 0\.2\.0/)

    const result = run(dir, ['changelog'])
    assert.equal(result.status, 0, result.err)
    assert.match(read(dir, 'CHANGELOG.md'), /^## 0\.2\.0 - \d{4}-\d{2}-\d{2}\n\n- \*\*First\.\*\* Its detail\.\n\n## 0\.1\.0/m)
    assert.deepEqual(fragments(dir), [])
    assert.match(read(dir, 'package.json'), /"version": "0\.2\.0"/)

    const again = run(dir, ['changelog'])
    assert.equal(again.status, 0, again.err)
    assert.match(again.out, /no fragments/)
  })
})

test('a fold refuses a version that already has a heading, and writes nothing', () => {
  withFolder((dir) => {
    layout(dir, '0.1.0')
    write(dir, 'changelog.d/card1-first.md', '- **First.** Its detail.\n')
    const before = read(dir, 'CHANGELOG.md')
    const result = run(dir, ['changelog'])
    assert.equal(result.status, 1)
    assert.match(result.err, /already has a heading for 0\.1\.0; nothing folded/)
    assert.equal(read(dir, 'CHANGELOG.md'), before)
    assert.deepEqual(fragments(dir), ['card1-first.md'])
  })
})

test('a fragment that does not start with a bullet is refused, and nothing is written', () => {
  withFolder((dir) => {
    layout(dir, '0.1.0')
    write(dir, 'changelog.d/card1-prose.md', 'Just some prose, no bullet.\n')
    const changelog = read(dir, 'CHANGELOG.md')
    const result = run(dir, ['patch'])
    assert.equal(result.status, 1)
    assert.match(result.err, /card1-prose\.md: a fragment is an entry that starts with a bullet/)
    assert.match(read(dir, 'package.json'), /"version": "0\.1\.0"/)
    assert.equal(read(dir, 'CHANGELOG.md'), changelog)
    assert.deepEqual(fragments(dir), ['card1-prose.md'])
  })
})

// The CI rule (`changelog-check`), fed the name-status lines of a pull request as git prints them.
test('the CI rule passes a worker branch with a fragment, and says which rule passed', () => {
  withFolder((dir) => {
    layout(dir, '0.1.1')
    const result = run(dir, ['changelog-check'], 'A\tchangelog.d/card1-first.md\nM\tsrc/a.ts\n')
    assert.equal(result.status, 0, result.err)
    assert.match(result.out, /^rule: fragment added \(changelog\.d\/card1-first\.md\)/)
  })
})

test('the CI rule passes the publish pull request that folded the fragments, and says so', () => {
  withFolder((dir) => {
    layout(dir, '0.1.1')
    // The folded PR: CHANGELOG.md gained the version heading, the fragments were deleted, package.json was raised.
    const folded = 'M\tCHANGELOG.md\nD\tchangelog.d/card1-first.md\nD\tchangelog.d/card2-second.md\nM\tpackage.json\nM\tnix/arnotes.nix\n'
      + '--- CHANGELOG.md diff\n@@ -1,3 +1,8 @@\n+## 0.1.1 - 2026-08-01\n+\n+- First\n+- Second\n'
    const result = run(dir, ['changelog-check'], folded)
    assert.equal(result.status, 0, result.err)
    assert.match(result.out, /^rule: folded changelog \(CHANGELOG\.md changed, 2 fragments deleted, version heading added\)/)
  })
})

test('a hand edit of CHANGELOG.md with the fragments deleted, and no version heading added, is refused', () => {
  withFolder((dir) => {
    layout(dir, '0.1.1')
    // Someone removed the fragments and typed into CHANGELOG.md by hand: no "## <version> - <date>" line is added.
    const handEdit = 'M\tCHANGELOG.md\nD\tchangelog.d/card1-first.md\n--- CHANGELOG.md diff\n@@ -4 +4 @@\n-Initial open-source release.\n+Initial open-source release, edited.\n'
    const result = run(dir, ['changelog-check'], handEdit)
    assert.equal(result.status, 1)
    assert.match(result.err, /changed without a new "## <version> - <date>" heading/)
  })
})

test('the CI rule refuses a hand edit of CHANGELOG.md, and a code change with no fragment', () => {
  withFolder((dir) => {
    layout(dir, '0.1.1')
    const handEdit = run(dir, ['changelog-check'], 'M\tCHANGELOG.md\nM\tsrc/a.ts\n')
    assert.equal(handEdit.status, 1)
    assert.match(handEdit.err, /adds no changelog fragment/)
    const codeOnly = run(dir, ['changelog-check'], 'M\tserver/api/x.ts\n')
    assert.equal(codeOnly.status, 1)
  })
})

test('the CI rule passes a change of documentation or dependency hashes only, and says so', () => {
  withFolder((dir) => {
    layout(dir, '0.1.1')
    const result = run(dir, ['changelog-check'], 'M\tCONTRIBUTING.md\nM\tdocs/admin/x.txt\nM\tnix/hashes.json\nM\tflake.lock\n')
    assert.equal(result.status, 0, result.err)
    assert.match(result.out, /^rule: not needed/)
  })
})

// A throwaway git repository in the folder: the script and a base CHANGELOG committed on master.
function gitFolder(dir: string) {
  const git = (args: string[]) => {
    const env = { ...process.env }
    delete env.GIT_DIR
    delete env.GIT_WORK_TREE
    delete env.GIT_INDEX_FILE
    return spawnSync('git', args, { cwd: dir, env, encoding: 'utf8' })
  }
  const must = (args: string[]) => {
    const result = git(args)
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`)
    return result
  }
  must(['init', '-q', '-b', 'master', '.'])
  must(['config', 'user.name', 'Test'])
  must(['config', 'user.email', 'test@example.invalid'])
  must(['config', 'commit.gpgSign', 'false'])
  must(['add', '-A'])
  must(['commit', '-q', '-m', 'base'])
  return { git, must }
}

test('two branches that each add a fragment merge with no conflict, and the fold keeps both entries', () => {
  withFolder((dir) => {
    layout(dir, '0.1.1')
    write(dir, 'changelog.d/.gitkeep', '')
    const { git, must } = gitFolder(dir)

    must(['checkout', '-q', '-b', 'card-a'])
    write(dir, 'changelog.d/aaaa1111-first.md', '- **First change.** Its detail.\n')
    must(['add', '-A'])
    must(['commit', '-q', '-m', 'first'])

    must(['checkout', '-q', 'master'])
    must(['checkout', '-q', '-b', 'card-b'])
    write(dir, 'changelog.d/bbbb2222-second.md', '- **Second change.** Its detail.\n')
    must(['add', '-A'])
    must(['commit', '-q', '-m', 'second'])

    must(['checkout', '-q', 'card-a'])
    const merge = git(['merge', '--no-edit', '-q', 'card-b'])
    assert.equal(merge.status, 0, `merge conflicted: ${merge.stdout}${merge.stderr}`)
    assert.deepEqual(fragments(dir), ['aaaa1111-first.md', 'bbbb2222-second.md'])

    const result = run(dir, ['changelog'])
    assert.equal(result.status, 0, result.err)
    assert.match(
      read(dir, 'CHANGELOG.md'),
      /^## 0\.1\.1 - \d{4}-\d{2}-\d{2}\n\n- \*\*First change\.\*\* Its detail\.\n\n- \*\*Second change\.\*\* Its detail\.\n\n## 0\.1\.0/m
    )
    assert.deepEqual(fragments(dir), [])
  })
})

test('the old way, two branches that each add a line at the top of Unreleased, conflicts', () => {
  withFolder((dir) => {
    layout(dir, '0.1.1')
    write(dir, 'CHANGELOG.md', '# Changelog\n\n## Unreleased\n\n- Base entry.\n\n## 0.1.0 - 2026-07-28\n\n- Self-hosted notes\n')
    const { git, must } = gitFolder(dir)

    must(['checkout', '-q', '-b', 'card-a'])
    write(dir, 'CHANGELOG.md', '# Changelog\n\n## Unreleased\n\n- **First.** Detail.\n\n- Base entry.\n\n## 0.1.0 - 2026-07-28\n\n- Self-hosted notes\n')
    must(['add', '-A'])
    must(['commit', '-q', '-m', 'first'])

    must(['checkout', '-q', 'master'])
    must(['checkout', '-q', '-b', 'card-b'])
    write(dir, 'CHANGELOG.md', '# Changelog\n\n## Unreleased\n\n- **Second.** Detail.\n\n- Base entry.\n\n## 0.1.0 - 2026-07-28\n\n- Self-hosted notes\n')
    must(['add', '-A'])
    must(['commit', '-q', '-m', 'second'])

    must(['checkout', '-q', 'card-a'])
    assert.notEqual(git(['merge', '--no-edit', '-q', 'card-b']).status, 0)
  })
})
