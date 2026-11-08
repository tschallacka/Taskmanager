// scripts/bump-version.mjs: the bump of every copy of the version, and the release tag. Each test
// works in a throwaway folder under tests/ (removed afterwards), never in the real repository, and
// the tag and push tests use a local bare repository as origin. Run:
//   node --import tsx --test tests/bump-version.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = process.cwd()
const SCRIPT = join(ROOT, 'scripts', 'bump-version.mjs')

// A folder under tests/ that the test removes itself.
function scratch(): string {
  return mkdtempSync(join(ROOT, 'tests', 'bump-version-scratch-'))
}

// The script runs in a folder laid out like the repository, so ROOT is that folder.
function layout(dir: string) {
  mkdirSync(join(dir, 'scripts'), { recursive: true })
  mkdirSync(join(dir, 'nix'), { recursive: true })
  mkdirSync(join(dir, 'server', 'api', 'mcp'), { recursive: true })
  copyFileSync(SCRIPT, join(dir, 'scripts', 'bump-version.mjs'))
}

function write(dir: string, file: string, text: string) {
  mkdirSync(dirname(join(dir, file)), { recursive: true })
  writeFileSync(join(dir, file), text)
}

const read = (dir: string, file: string) => readFileSync(join(dir, file), 'utf8')

// The package.json shape of the repository: two-space indent, version on the second line, trailing newline.
function packageJson(version: string) {
  return `{\n  "name": "arnotes",\n  "version": "${version}",\n  "private": true,\n  "type": "module",\n  "scripts": {\n    "dev": "nuxt dev"\n  }\n}\n`
}

function fixture(dir: string, version = '0.1.0') {
  layout(dir)
  write(dir, 'package.json', packageJson(version))
  write(dir, 'nix/arnotes.nix', `{\n  pname = "arnotes";\n  version = "${version}";\n}\n`)
  write(dir, 'nix/packages.nix', `{\n  a = stdenv.mkDerivation {\n    version = "${version}";\n  };\n  b = stdenv.mkDerivation {\n    version = "${version}";\n  };\n}\n`)
  write(dir, 'nix/schema.nix', `{\n  version = "${version}";\n}\n`)
  write(dir, 'server/api/mcp/index.post.ts', `const SERVER_NAME = 'Taskmanager'\nconst SERVER_VERSION = '${version}'\n`)
}

// Runs the script with a clean git environment, so no GIT_DIR from a hook can point it at the real repository.
function run(dir: string, args: string[]) {
  const env = { ...process.env }
  delete env.GIT_DIR
  delete env.GIT_WORK_TREE
  delete env.GIT_INDEX_FILE
  const result = spawnSync(process.execPath, [join(dir, 'scripts', 'bump-version.mjs'), ...args], { cwd: dir, env, encoding: 'utf8' })
  return { status: result.status, out: result.stdout, err: result.stderr }
}

function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (folder: string) => {
    for (const name of readdirSync(folder)) {
      const path = join(folder, name)
      if (statSync(path).isDirectory()) {
        if (name !== '.git') walk(path)
      } else {
        files[path.slice(dir.length + 1)] = readFileSync(path, 'utf8')
      }
    }
  }
  walk(dir)
  return files
}

// A throwaway git repository with origin: a local bare repository, master pushed to it.
function gitRepo(dir: string, version = '0.1.0') {
  const bare = scratch()
  const git = (cwd: string, args: string[]) => {
    const env = { ...process.env }
    delete env.GIT_DIR
    delete env.GIT_WORK_TREE
    delete env.GIT_INDEX_FILE
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
    return result.stdout.trim()
  }
  git(bare, ['init', '-q', '--bare', '-b', 'master', '.'])
  git(dir, ['init', '-q', '-b', 'master', '.'])
  git(dir, ['config', 'user.name', 'Test'])
  git(dir, ['config', 'user.email', 'test@example.invalid'])
  git(dir, ['config', 'tag.gpgSign', 'false'])
  fixture(dir, version)
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', `Release ${version} base`])
  git(dir, ['remote', 'add', 'origin', bare])
  git(dir, ['push', '-q', 'origin', 'master'])
  git(dir, ['fetch', '-q', 'origin', 'master'])
  return { bare, git: (args: string[]) => git(dir, args) }
}

function cleanup(...folders: string[]) {
  for (const folder of folders) if (folder) rmSync(folder, { recursive: true, force: true })
}

test('patch, feature and breaking do the version arithmetic', () => {
  const cases: [string, string, string][] = [
    ['0.1.0', 'patch', '0.1.1'],
    ['0.1.0', 'feature', '0.2.0'],
    ['1.2.3', 'patch', '1.2.4'],
    ['1.2.3', 'feature', '1.3.0'],
    ['1.2.3', 'breaking', '2.0.0'],
    ['0.1.0', 'breaking', '0.2.0'],
    ['0.9.9', 'breaking', '0.10.0'],
    ['0.9.9', 'feature', '0.10.0'],
    ['0.9.9', 'patch', '0.9.10'],
    ['9.9.9', 'breaking', '10.0.0']
  ]
  for (const [from, kind, to] of cases) {
    const dir = scratch()
    try {
      fixture(dir, from)
      const result = run(dir, [kind])
      assert.equal(result.status, 0, result.err)
      assert.match(result.out, new RegExp(`version: ${from.replace(/\./g, '\\.')} -> ${to.replace(/\./g, '\\.')} \\(${kind}(, held at 0\\.x: beta)?\\)`))
      assert.match(read(dir, 'package.json'), new RegExp(`"version": "${to.replace(/\./g, '\\.')}"`))
    } finally {
      cleanup(dir)
    }
  }
})

test('a breaking change from 0.x bumps the minor and prints one line saying so', () => {
  const dir = scratch()
  try {
    fixture(dir, '0.4.2')
    const result = run(dir, ['breaking'])
    assert.equal(result.status, 0, result.err)
    assert.match(result.out, /^major is 0: a breaking change bumps the minor \(0\.2\.0\), not the major$/m)
    assert.match(result.out, /version: 0\.4\.2 -> 0\.5\.0 \(breaking, held at 0\.x: beta\)/)
    assert.equal(result.out.split('\n').filter(line => /^major is 0/.test(line)).length, 1)
    assert.match(read(dir, 'package.json'), /"version": "0\.5\.0"/)
  } finally {
    cleanup(dir)
  }

  const plain = scratch()
  try {
    fixture(plain, '1.4.2')
    const result = run(plain, ['breaking'])
    assert.equal(result.status, 0, result.err)
    assert.doesNotMatch(result.out, /major is 0/)
  } finally {
    cleanup(plain)
  }
})

test('package.json keeps its formatting and key order byte for byte apart from the version line', () => {
  const dir = scratch()
  try {
    fixture(dir, '0.1.0')
    const before = read(dir, 'package.json')
    const result = run(dir, ['feature'])
    assert.equal(result.status, 0, result.err)
    const expected = before.replace('"version": "0.1.0"', '"version": "0.2.0"')
    assert.equal(read(dir, 'package.json'), expected)
  } finally {
    cleanup(dir)
  }
})

test('every literal copy of the old version is replaced, and only those', () => {
  const dir = scratch()
  try {
    fixture(dir, '0.1.0')
    // A copy of another version, which must stay as it is.
    write(dir, 'nix/packages.nix', `{\n  a = stdenv.mkDerivation {\n    version = "0.1.0";\n  };\n  dep = fetch {\n    version = "3.0.1";\n  };\n  b = stdenv.mkDerivation {\n    version = "0.1.0";\n  };\n}\n`)
    const result = run(dir, ['patch'])
    assert.equal(result.status, 0, result.err)
    assert.match(read(dir, 'nix/arnotes.nix'), /version = "0\.1\.1";/)
    assert.match(read(dir, 'nix/schema.nix'), /version = "0\.1\.1";/)
    assert.match(read(dir, 'server/api/mcp/index.post.ts'), /SERVER_VERSION = '0\.1\.1'/)
    const packages = read(dir, 'nix/packages.nix')
    assert.equal(packages.match(/version = "0\.1\.1";/g)?.length, 2)
    assert.match(packages, /version = "3\.0\.1";/)
    assert.match(result.out, /nix\/packages\.nix: changed \(2 copies\)/)
  } finally {
    cleanup(dir)
  }
})

test('a listed file with no literal copy is reported, not refused', () => {
  const dir = scratch()
  try {
    fixture(dir, '0.1.0')
    write(dir, 'server/api/mcp/index.post.ts', `const SERVER_NAME = 'Taskmanager'\nconst SERVER_VERSION = readPackageVersion()\n`)
    const result = run(dir, ['patch'])
    assert.equal(result.status, 0, result.err)
    assert.match(result.out, /server\/api\/mcp\/index\.post\.ts: no literal copy \(reads package\.json\)/)
    assert.match(read(dir, 'package.json'), /"version": "0\.1\.1"/)
  } finally {
    cleanup(dir)
  }
})

test('dry run prints the same lines and writes nothing', () => {
  const dir = scratch()
  try {
    fixture(dir, '0.1.0')
    const before = snapshot(dir)
    const dry = run(dir, ['breaking', '--dry-run'])
    assert.equal(dry.status, 0, dry.err)
    assert.match(dry.out, /package\.json: changed/)
    assert.match(dry.out, /version: 0\.1\.0 -> 0\.2\.0 \(breaking, held at 0\.x: beta\)/)
    assert.match(dry.out, /dry run: nothing written/)
    assert.deepEqual(snapshot(dir), before)
  } finally {
    cleanup(dir)
  }
})

test('a version that is not strict semver is refused and nothing is written', () => {
  for (const bad of ['1.0.0-beta.1', '1.0.0+build.5', '1.0', 'v1.0.0', '01.2.3']) {
    const dir = scratch()
    try {
      fixture(dir, '0.1.0')
      write(dir, 'package.json', packageJson(bad))
      const before = snapshot(dir)
      const result = run(dir, ['patch'])
      assert.equal(result.status, 1, `${bad} should be refused`)
      assert.match(result.err, /not a plain x\.y\.z version/)
      assert.deepEqual(snapshot(dir), before)
    } finally {
      cleanup(dir)
    }
  }
})

test('an unknown kind or argument is a usage error', () => {
  const dir = scratch()
  try {
    fixture(dir, '0.1.0')
    const kind = run(dir, ['minor'])
    assert.equal(kind.status, 2)
    assert.match(kind.err, /usage:/)
    const flag = run(dir, ['patch', '--yes'])
    assert.equal(flag.status, 2)
    assert.match(read(dir, 'package.json'), /"version": "0\.1\.0"/)
  } finally {
    cleanup(dir)
  }
})

test('tag mode creates an annotated tag with the message the card asks for', () => {
  const dir = scratch()
  let bare = ''
  try {
    const repo = gitRepo(dir, '0.2.0')
    bare = repo.bare
    const sha = repo.git(['rev-parse', 'HEAD'])
    const subject = repo.git(['log', '-1', '--format=%s'])
    const result = run(dir, ['tag'])
    assert.equal(result.status, 0, result.err)
    assert.match(result.out, /tagged v0\.2\.0 at [0-9a-f]{7}/)
    assert.equal(repo.git(['cat-file', '-t', 'refs/tags/v0.2.0']), 'tag')
    assert.equal(repo.git(['rev-parse', 'refs/tags/v0.2.0^{commit}']), sha)
    const message = repo.git(['tag', '-l', '--format=%(contents)', 'v0.2.0'])
    assert.equal(message, `Taskmanager 0.2.0\n${subject}`)
  } finally {
    cleanup(dir, bare)
  }
})

// The publisher's commit line carries the kind; the tag message gets it in brackets.
function kindCommit(repo: { git: (args: string[]) => string }, message: string) {
  repo.git(['commit', '-q', '--allow-empty', '-m', message])
  repo.git(['push', '-q', 'origin', 'master'])
  repo.git(['fetch', '-q', 'origin', 'master'])
}

test('tag mode takes the kind from the commit line into the tag message', () => {
  const dir = scratch()
  let bare = ''
  try {
    const repo = gitRepo(dir, '0.2.0')
    bare = repo.bare
    kindCommit(repo, 'Bump to 0.2.0\n\nVersion 0.1.3 -> 0.2.0 (breaking, held at 0.x: beta).')
    const subject = repo.git(['log', '-1', '--format=%s'])
    const result = run(dir, ['tag'])
    assert.equal(result.status, 0, result.err)
    assert.equal(repo.git(['tag', '-l', '--format=%(contents)', 'v0.2.0']), `Taskmanager 0.2.0 (breaking)\n${subject}`)
  } finally {
    cleanup(dir, bare)
  }
})

test('tag mode records a feature kind the same way', () => {
  const dir = scratch()
  let bare = ''
  try {
    const repo = gitRepo(dir, '0.2.0')
    bare = repo.bare
    kindCommit(repo, 'Add the thing\n\nVersion 0.1.3 -> 0.2.0 (feature).')
    const result = run(dir, ['tag'])
    assert.equal(result.status, 0, result.err)
    assert.equal(repo.git(['tag', '-l', '--format=%(contents)', 'v0.2.0']).split('\n')[0], 'Taskmanager 0.2.0 (feature)')
  } finally {
    cleanup(dir, bare)
  }
})

test('tag mode refuses a commit line whose new version differs from package.json', () => {
  const dir = scratch()
  let bare = ''
  try {
    const repo = gitRepo(dir, '0.2.0')
    bare = repo.bare
    kindCommit(repo, 'Wrong line\n\nVersion 0.1.3 -> 0.3.0 (feature).')
    const result = run(dir, ['tag'])
    assert.equal(result.status, 1)
    assert.match(result.err, /says 0\.3\.0, but package\.json at [0-9a-f]{7} says 0\.2\.0/)
    assert.equal(repo.git(['tag', '-l', 'v0.2.0']), '')
  } finally {
    cleanup(dir, bare)
  }
})

test('tag mode refuses a tag that already exists and never moves it', () => {
  const dir = scratch()
  let bare = ''
  try {
    const repo = gitRepo(dir, '0.2.0')
    bare = repo.bare
    assert.equal(run(dir, ['tag']).status, 0)
    const first = repo.git(['rev-parse', 'refs/tags/v0.2.0'])
    write(dir, 'extra.txt', 'later\n')
    repo.git(['add', '-A'])
    repo.git(['commit', '-q', '-m', 'Later work'])
    repo.git(['push', '-q', 'origin', 'master'])
    repo.git(['fetch', '-q', 'origin', 'master'])
    const again = run(dir, ['tag'])
    assert.equal(again.status, 1)
    assert.match(again.err, /tag v0\.2\.0 already exists/)
    assert.equal(repo.git(['rev-parse', 'refs/tags/v0.2.0']), first)
  } finally {
    cleanup(dir, bare)
  }
})

test('tag mode refuses a commit that is not on origin/master', () => {
  const dir = scratch()
  let bare = ''
  try {
    const repo = gitRepo(dir, '0.3.0')
    bare = repo.bare
    repo.git(['checkout', '-q', '-b', 'feature/unmerged'])
    write(dir, 'extra.txt', 'unmerged\n')
    repo.git(['add', '-A'])
    repo.git(['commit', '-q', '-m', 'Unmerged work'])
    const unmerged = repo.git(['rev-parse', 'HEAD'])
    const result = run(dir, ['tag'])
    assert.equal(result.status, 1)
    assert.match(result.err, /is not on origin\/master/)
    assert.equal(repo.git(['tag', '-l', 'v0.3.0']), '')
    const byRef = run(dir, ['tag', '--ref', unmerged])
    assert.equal(byRef.status, 1)
    assert.match(byRef.err, /is not on origin\/master/)
    assert.equal(repo.git(['tag', '-l', 'v0.3.0']), '')
  } finally {
    cleanup(dir, bare)
  }
})

test('tag mode tags the commit given by --ref with the version it had there', () => {
  const dir = scratch()
  let bare = ''
  try {
    const repo = gitRepo(dir, '0.2.0')
    bare = repo.bare
    const base = repo.git(['rev-parse', 'HEAD'])
    write(dir, 'package.json', packageJson('0.3.0'))
    repo.git(['add', '-A'])
    repo.git(['commit', '-q', '-m', 'Bump to 0.3.0'])
    repo.git(['push', '-q', 'origin', 'master'])
    repo.git(['fetch', '-q', 'origin', 'master'])
    const result = run(dir, ['tag', '--ref', base])
    assert.equal(result.status, 0, result.err)
    assert.equal(repo.git(['rev-parse', 'refs/tags/v0.2.0^{commit}']), base)
  } finally {
    cleanup(dir, bare)
  }
})

test('tag mode --dry-run creates nothing', () => {
  const dir = scratch()
  let bare = ''
  try {
    const repo = gitRepo(dir, '0.2.0')
    bare = repo.bare
    const result = run(dir, ['tag', '--dry-run'])
    assert.equal(result.status, 0, result.err)
    assert.match(result.out, /would tag v0\.2\.0/)
    assert.equal(repo.git(['tag', '-l', 'v0.2.0']), '')
  } finally {
    cleanup(dir, bare)
  }
})

test('tag mode --push pushes that one tag to the remote and nothing else', () => {
  const dir = scratch()
  let bare = ''
  try {
    const repo = gitRepo(dir, '0.2.0')
    bare = repo.bare
    const result = run(dir, ['tag', '--push'])
    assert.equal(result.status, 0, result.err)
    assert.match(result.out, /pushed v0\.2\.0 to origin/)
    const remoteTags = spawnSync('git', ['ls-remote', '--tags', bare], { encoding: 'utf8' }).stdout
    assert.match(remoteTags, /refs\/tags\/v0\.2\.0/)
    const remoteBranches = spawnSync('git', ['ls-remote', '--heads', bare], { encoding: 'utf8' }).stdout
    assert.equal(remoteBranches.split('\n').filter(Boolean).length, 1)
  } finally {
    cleanup(dir, bare)
  }
})
