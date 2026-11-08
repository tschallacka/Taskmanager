// Tests for crew publish (publish.mjs): the flow end to end against throwaway git repositories, and the settings it reads.
// Run from the repo root: node --test crew/publish.test.mjs
//
// Every repository, origin and crew home is made in a temp folder under this test's own folder (.publish-test-*), and
// removed at the end. The commands the tests configure only write files into that folder. Nothing touches the real
// repository, the real crew home or a database: a DATABASE_URL from the environment is removed by publish.mjs itself,
// and the test checks that.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { bumpVersion, expandPlaceholders, parseSettings, placeVersionLine, rewriteVersion, shellQuote, versionProblems } from './publish.mjs'

const KIT = dirname(fileURLToPath(import.meta.url))
const PUBLISH = join(KIT, 'publish.mjs')
const CREW = join(KIT, 'crew.mjs')
const roots = []
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

const out = run => `${run.stdout}${run.stderr}`

function git(cwd, args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(run.status, 0, `git ${args.join(' ')} in ${cwd}: ${run.stderr}`)
  return run.stdout.trim()
}

function write(file, text) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}

// A bare origin, and a work repository pushed to it with a base commit on main. The feature branch adds the given
// files and changes shared.txt. mainChange, when given, moves main on shared.txt after the branch was cut (a conflict).
// baseFiles are written into the base commit on top of the default package.json.
function fixture({ mainChange = null, featureFiles = {}, baseFiles = {} } = {}) {
  const root = mkdtempSync(join(KIT, '.publish-test-'))
  roots.push(root)
  const origin = join(root, 'origin.git')
  const work = join(root, 'work')
  const home = join(root, 'home')
  git(root, ['init', '-q', '--bare', '-b', 'main', origin])
  git(root, ['init', '-q', '-b', 'main', work])
  git(work, ['config', 'user.name', 'Repo Owner'])
  git(work, ['config', 'user.email', 'owner@example.test'])
  write(join(work, 'shared.txt'), 'one\n')
  write(join(work, 'package.json'), '{}\n')
  for (const [file, text] of Object.entries(baseFiles)) write(join(work, file), text)
  git(work, ['add', '-A'])
  git(work, ['commit', '-q', '-m', 'base'])
  git(work, ['remote', 'add', 'origin', origin])
  git(work, ['push', '-q', 'origin', 'main'])
  git(work, ['checkout', '-q', '-b', 'feature'])
  for (const [file, text] of Object.entries(featureFiles)) write(join(work, file), text)
  write(join(work, 'shared.txt'), 'feature\n')
  git(work, ['add', '-A'])
  git(work, ['commit', '-q', '-m', 'feature'])
  git(work, ['checkout', '-q', 'main'])
  if (mainChange !== null) {
    write(join(work, 'shared.txt'), mainChange)
    git(work, ['commit', '-q', '-am', 'main moves on'])
    git(work, ['push', '-q', 'origin', 'main'])
  }
  mkdirSync(home, { recursive: true })
  const msg = join(root, 'msg.txt')
  const pr = join(root, 'pr.md')
  write(msg, 'Add the feature\n\nBody line.\n')
  write(pr, 'The body.\n')
  return { root, origin, work, home, msg, pr }
}

// Runs `crew publish` as a child with a crew.json of its own under the fixture's crew home.
function publish(fx, settings, args, env = {}, product = { repo: fx.work }) {
  writeFileSync(join(fx.home, 'crew.json'), JSON.stringify({ team: 'Test Crew', product, publish: { remote: 'origin', base: 'main', ...settings } }))
  const childEnv = { ...process.env, CREW_HOME: fx.home }
  delete childEnv.FORCE
  delete childEnv.DATABASE_URL
  delete childEnv.BUMP
  Object.assign(childEnv, env)
  return spawnSync(process.execPath, [PUBLISH, ...args], { encoding: 'utf8', env: childEnv })
}

const args = (fx, slug = 'feat', branch = 'feature') => [slug, branch, 'Add the feature', fx.msg, fx.pr]
const touched = fx => `touch ${shellQuote(join(fx.root, 'pr.called'))}`
const onOrigin = (fx, branch) => spawnSync('git', ['-C', fx.origin, 'rev-parse', '--verify', '-q', branch]).status === 0

describe('crew publish, end to end', () => {
  test('a clean branch is squashed onto the fresh base, checked, committed with the attribution, pushed, and the pull request opened', () => {
    const fx = fixture({ featureFiles: { 'feature.txt': 'feature\n' } })
    const run = publish(fx, {
      commitName: 'Merger', commitEmail: 'merger@example.test',
      attribution: ['Co-Authored-By: Test <test@example.test>'],
      typecheck: `test -f feature.txt && printf '%s' "$DATABASE_URL" > ${shellQuote(join(fx.root, 'db.seen'))}`,
      lint: `printf '%s ' {files} > ${shellQuote(join(fx.root, 'lint.seen'))}`,
      scratchDatabase: 'postgres://scratch.test/db',
      pr: `printf '%s|%s|%s\\n' {branch} {base} {title} > ${shellQuote(join(fx.root, 'pr.called'))}`
    }, args(fx), { DATABASE_URL: 'postgres://real.example/prod' })
    assert.equal(run.status, 0, out(run))
    assert.match(out(run), /skipped: publish\.install is empty/)
    assert.match(out(run), /published crew-feat to origin/)
    // the checks saw the scratch database, never the one from the environment
    assert.equal(readFileSync(join(fx.root, 'db.seen'), 'utf8'), 'postgres://scratch.test/db')
    // lint got every file the change touches
    assert.match(readFileSync(join(fx.root, 'lint.seen'), 'utf8'), /'feature\.txt'|feature\.txt/)
    // the worktree is under the crew home
    assert.ok(existsSync(join(fx.home, 'publish', 'wt-feat', 'feature.txt')))
    // one squashed commit on top of the base, with the message and the attribution, under the merger's name
    assert.equal(git(fx.origin, ['rev-list', '--count', 'crew-feat']), '2')
    assert.match(git(fx.origin, ['log', '-1', '--format=%B', 'crew-feat']), /Add the feature\n\nBody line\.\n\nCo-Authored-By: Test/)
    assert.equal(git(fx.origin, ['log', '-1', '--format=%an <%ae>', 'crew-feat']), 'Merger <merger@example.test>')
    assert.equal(readFileSync(join(fx.root, 'pr.called'), 'utf8'), 'crew-feat|main|Add the feature\n')
  })

  test('a conflict stops with exit 3, names the file, keeps the worktree and pushes nothing', () => {
    const fx = fixture({ mainChange: 'main\n' })
    const run = publish(fx, { pr: touched(fx) }, args(fx))
    assert.equal(run.status, 3, out(run))
    assert.match(out(run), /MERGE CONFLICT/)
    assert.match(out(run), /shared\.txt/)
    assert.ok(existsSync(join(fx.home, 'publish', 'wt-feat')))
    assert.equal(existsSync(join(fx.root, 'pr.called')), false)
    assert.equal(onOrigin(fx, 'crew-feat'), false)
  })

  test('a failing check stops before the push; FORCE=1 pushes past it', () => {
    const fx = fixture({ featureFiles: { 'feature.txt': 'feature\n' } })
    const settings = { typecheck: 'echo broken-type >&2; exit 2', pr: touched(fx) }
    const stopped = publish(fx, settings, args(fx))
    assert.equal(stopped.status, 4, out(stopped))
    assert.match(out(stopped), /FAILED \(log .*typecheck-feat\.log\)/)
    assert.match(out(stopped), /stop before pushing/)
    assert.match(readFileSync(join(fx.home, 'publish', 'logs', 'typecheck-feat.log'), 'utf8'), /broken-type/)
    assert.equal(existsSync(join(fx.root, 'pr.called')), false)
    assert.equal(onOrigin(fx, 'crew-feat'), false)

    const forced = publish(fx, settings, args(fx), { FORCE: '1' })
    assert.equal(forced.status, 0, out(forced))
    assert.match(out(forced), /FORCE=1: going on past the failed typecheck of the merged tree/)
    assert.match(out(forced), /FORCE=1: pushed past the failed typecheck of the merged tree/)
    assert.equal(onOrigin(fx, 'crew-feat'), true)
    assert.ok(existsSync(join(fx.root, 'pr.called')))
  })

  test('a failing full suite is a stop too', () => {
    const fx = fixture({ featureFiles: { 'feature.txt': 'feature\n' } })
    const run = publish(fx, { test: 'exit 1', pr: touched(fx) }, args(fx))
    assert.equal(run.status, 4, out(run))
    assert.match(out(run), /FAILED \(log .*test-feat\.log\)/)
    assert.equal(onOrigin(fx, 'crew-feat'), false)
  })

  test('a schema change notes the schema and migrates only the scratch database; without one the migration is noted and skipped', () => {
    const fx = fixture({ featureFiles: { 'db/schema.sql': 'create table t();\n', 'package.json': '{"name":"x"}\n' } })
    const common = { schemaFiles: ['db/schema.sql'], lockFiles: ['package.json'], pr: touched(fx) }
    const noScratch = publish(fx, { ...common, migrate: `touch ${shellQuote(join(fx.root, 'migrated.seen'))}` }, args(fx, 'noscratch'))
    assert.equal(noScratch.status, 0, out(noScratch))
    assert.match(out(noScratch), /NOTE: the schema changed/)
    assert.match(out(noScratch), /NOTE: a lock file changed/)
    assert.match(out(noScratch), /NOTE: publish\.migrate is set but publish\.scratchDatabase is not: nothing migrated/)
    assert.equal(existsSync(join(fx.root, 'migrated.seen')), false)

    const withScratch = publish(fx, {
      ...common,
      migrate: `printf '%s' "$DATABASE_URL" > ${shellQuote(join(fx.root, 'migrated.seen'))}`,
      scratchDatabase: 'postgres://scratch.test/db'
    }, args(fx, 'withscratch'), { DATABASE_URL: 'postgres://real.example/prod' })
    assert.equal(withScratch.status, 0, out(withScratch))
    assert.match(out(withScratch), /migration of the scratch database:/)
    assert.equal(readFileSync(join(fx.root, 'migrated.seen'), 'utf8'), 'postgres://scratch.test/db')
  })

  test('the commands get the scratch database only: with none set, DATABASE_URL from the environment is not passed on', () => {
    const fx = fixture({ featureFiles: { 'feature.txt': 'feature\n' } })
    const run = publish(fx, {
      test: `printf '%s' "\${DATABASE_URL-unset}" > ${shellQuote(join(fx.root, 'db.seen'))}`,
      pr: touched(fx)
    }, args(fx), { DATABASE_URL: 'postgres://real.example/prod' })
    assert.equal(run.status, 0, out(run))
    assert.match(out(run), /publish\.scratchDatabase is empty/)
    assert.equal(readFileSync(join(fx.root, 'db.seen'), 'utf8'), 'unset')
  })

  test('the pull request is a note when its command is empty, and the worktree is replaced on the next run', () => {
    const fx = fixture({ featureFiles: { 'feature.txt': 'feature\n' } })
    const first = publish(fx, { typecheck: 'exit 1' }, args(fx))
    assert.equal(first.status, 4, out(first))
    const second = publish(fx, {}, args(fx))
    assert.equal(second.status, 0, out(second))
    assert.match(out(second), /skipped: publish\.pr is empty; open the pull request by hand/)
    assert.equal(onOrigin(fx, 'crew-feat'), true)
  })

  test('the usage is printed for a wrong number of arguments, a bad slug or a missing file', () => {
    const fx = fixture()
    assert.equal(publish(fx, {}, ['feat']).status, 2)
    assert.equal(publish(fx, {}, ['Bad Slug', 'feature', 't', fx.msg, fx.pr]).status, 2)
    assert.equal(publish(fx, {}, ['feat', 'feature', 't', join(fx.root, 'nope.txt'), fx.pr]).status, 2)
  })

  test('crew publish is a route of crew.mjs', () => {
    const run = spawnSync(process.execPath, [CREW, 'publish'], { encoding: 'utf8' })
    assert.equal(run.status, 2, out(run))
    assert.match(run.stderr, /usage: crew publish <slug> <branch> <title> <msg-file> <pr-file>/)
  })
})

describe('the settings publish reads from crew.json', () => {
  test('a misspelt setting and a setting of the wrong type are each named, and nothing is published', () => {
    const fx = fixture({ featureFiles: { 'feature.txt': 'feature\n' } })
    const run = publish(fx, { typo: 'x', test: 5, pr: touched(fx) }, args(fx))
    assert.equal(run.status, 1, out(run))
    assert.match(out(run), /publish\.typo is not a setting/)
    assert.match(out(run), /publish\.test must be a string/)
    assert.equal(existsSync(join(fx.root, 'pr.called')), false)
  })

  test('no repository, neither in publish nor in product, is named as a problem', () => {
    const fx = fixture()
    const run = publish(fx, {}, args(fx), {}, {})
    assert.equal(run.status, 1, out(run))
    assert.match(out(run), /publish\.repo is not set/)
  })

  test('the defaults fill in what is left out, and an empty step is a skip, not a problem', () => {
    const { settings, problems } = parseSettings({ repo: '/r' })
    assert.deepEqual(problems, [])
    assert.equal(settings.remote, 'origin')
    assert.equal(settings.base, 'main')
    assert.equal(settings.timeout, 600)
    assert.deepEqual(settings.attribution, [])
    assert.equal(settings.install, undefined)
  })

  test('commit identity is both or neither; a bad lint pattern is named', () => {
    assert.match(parseSettings({ repo: '/r', commitName: 'A' }).problems.join('\n'), /commitName and publish\.commitEmail go together/)
    assert.match(parseSettings({ repo: '/r', lintFiles: '([' }).problems.join('\n'), /lintFiles is not a valid regular expression/)
  })

  test('a quote in a title cannot break the command it is written into', () => {
    assert.equal(shellQuote('it\'s'), '\'it\'\\\'\'s\'')
    assert.equal(expandPlaceholders('echo {title} {files} {unknown}', { title: 'it\'s', files: ['a b.ts', 'c.ts'] }), 'echo \'it\'\\\'\'s\' \'a b.ts\' \'c.ts\' {unknown}')
  })
})

describe('the version bump: publish.version and BUMP', () => {
  // A package.json on main with the given text; the feature branch leaves it alone unless `extra` replaces it.
  const pkgText = (version, indent = 2) => `${JSON.stringify({ name: 'app', version }, null, indent)}\n`
  const withPackage = (text, extra = {}) => fixture({ baseFiles: { 'package.json': text }, featureFiles: { 'feature.txt': 'feature\n', ...extra } })
  const pkgOn = (fx, ref = 'crew-feat') => JSON.parse(git(fx.origin, ['show', `${ref}:package.json`]))
  const messageOn = (fx, ref = 'crew-feat') => git(fx.origin, ['log', '-1', '--format=%B', ref])
  // publish with a version setting (an empty object is the defaults: patch of package.json) and a pull request command
  const bumpRun = (fx, settings = {}, env = {}) => publish(fx, { version: {}, pr: touched(fx), ...settings }, args(fx), env)

  test('an empty version object bumps the patch of package.json on the merged tree, and the summary shows old -> new', () => {
    const fx = withPackage(pkgText('1.0.0'))
    const run = bumpRun(fx)
    assert.equal(run.status, 0, out(run))
    assert.match(out(run), /^version: 1\.0\.0 -> 1\.0\.1 \(patch\)$/m)
    assert.equal(pkgOn(fx).version, '1.0.1')
    assert.match(messageOn(fx), /Version 1\.0\.0 -> 1\.0\.1\./)
  })

  test('minor and major move the version the semver way; none leaves it alone and says so', () => {
    for (const [bump, next] of [['minor', '1.1.0'], ['major', '2.0.0']]) {
      const fx = withPackage(pkgText('1.0.3'))
      const run = bumpRun(fx, { version: { bump } })
      assert.equal(run.status, 0, out(run))
      assert.equal(pkgOn(fx).version, next)
    }
    const fx = withPackage(pkgText('1.0.0'))
    const run = bumpRun(fx, { version: { bump: 'none' } })
    assert.equal(run.status, 0, out(run))
    assert.match(out(run), /version: not bumped \(none\)/)
    assert.equal(pkgOn(fx).version, '1.0.0')
    assert.doesNotMatch(messageOn(fx), /Version /)
  })

  test('BUMP for one run overrides publish.version.bump; a value other than the four is refused', () => {
    const minor = withPackage(pkgText('1.0.0'))
    const run = bumpRun(minor, { version: { bump: 'patch' } }, { BUMP: 'minor' })
    assert.equal(run.status, 0, out(run))
    assert.equal(pkgOn(minor).version, '1.1.0')

    const none = withPackage(pkgText('1.0.0'))
    assert.match(out(bumpRun(none, { version: { bump: 'patch' } }, { BUMP: 'none' })), /version: not bumped \(none\)/)
    assert.equal(pkgOn(none).version, '1.0.0')

    const bad = bumpRun(withPackage(pkgText('1.0.0')), {}, { BUMP: 'huge' })
    assert.equal(bad.status, 2, out(bad))
    assert.match(bad.stderr, /BUMP=huge is not one of patch, minor, major, none/)
  })

  test('without publish.version nothing is bumped: the skip is printed, and a BUMP for the run is named as ignored', () => {
    const fx = withPackage(pkgText('1.0.0'))
    const run = publish(fx, { pr: touched(fx) }, args(fx), { BUMP: 'minor' })
    assert.equal(run.status, 0, out(run))
    assert.match(out(run), /version: skipped, publish\.version is empty \(BUMP=minor ignored\)/)
    assert.equal(pkgOn(fx).version, '1.0.0')
  })

  test('a version that is not plain x.y.z is refused with exit 4, and nothing is pushed', () => {
    const fx = withPackage(pkgText('1.0.0-beta.1'))
    const run = bumpRun(fx)
    assert.equal(run.status, 4, out(run))
    assert.match(run.stderr, /has no plain x\.y\.z "version" \(found "1\.0\.0-beta\.1"\)/)
    assert.equal(onOrigin(fx, 'crew-feat'), false)
    assert.equal(existsSync(join(fx.root, 'pr.called')), false)
  })

  test('a branch that already moved the version is left as it is: no second bump, and no version line in the message', () => {
    const fx = withPackage(pkgText('1.0.0'), { 'package.json': pkgText('1.4.0') })
    const run = bumpRun(fx)
    assert.equal(run.status, 0, out(run))
    assert.match(out(run), /^version: already bumped by the branch \(1\.0\.0 -> 1\.4\.0\), left as is$/m)
    assert.equal(pkgOn(fx).version, '1.4.0')
    assert.doesNotMatch(messageOn(fx), /Version /)
  })

  test('the version line goes before the trailers the message ends with, and the attribution after them', () => {
    const fx = withPackage(pkgText('1.0.0'))
    write(fx.msg, 'Add the feature\n\nBody line.\n\nClaude-Session: https://example.test/s\n')
    const run = bumpRun(fx, { attribution: ['Co-Authored-By: Test <test@example.test>'] })
    assert.equal(run.status, 0, out(run))
    assert.equal(messageOn(fx), 'Add the feature\n\nBody line.\n\nVersion 1.0.0 -> 1.0.1.\n\nClaude-Session: https://example.test/s\n\nCo-Authored-By: Test <test@example.test>')
  })

  test('the rest of package.json stays as it was: indentation, key order, line ends; a nested "version" is left alone', () => {
    const text = '{\n    "name": "app",\n    "version": "2.10.9",\n    "private": true,\n    "scripts": {\n        "version": "echo"\n    }\n}'
    const fx = withPackage(text)
    const run = bumpRun(fx)
    assert.equal(run.status, 0, out(run))
    assert.equal(git(fx.origin, ['show', 'crew-feat:package.json']), text.replace('"version": "2.10.9"', '"version": "2.10.10"'))
  })

  test('the rewrite of a standard package.json is what npm version writes', { skip: spawnSync('npm', ['--version']).status !== 0 && 'npm is not installed' }, () => {
    const root = mkdtempSync(join(KIT, '.publish-test-'))
    roots.push(root)
    const text = pkgText('1.2.3')
    write(join(root, 'package.json'), text)
    const npm = spawnSync('npm', ['version', 'minor', '--no-git-tag-version', '--ignore-scripts'], { cwd: root, encoding: 'utf8' })
    assert.equal(npm.status, 0, out(npm))
    assert.equal(rewriteVersion(text, '1.2.3', '1.3.0'), readFileSync(join(root, 'package.json'), 'utf8'))
  })
})

describe('the version helpers and settings', () => {
  test('bumpVersion moves one step: patch, minor or major', () => {
    assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4')
    assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0')
    assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0')
    assert.equal(bumpVersion('9.9.9', 'patch'), '9.9.10')
  })

  test('rewriteVersion changes only the top-level version value, and is null without one', () => {
    assert.equal(rewriteVersion('{\n\t"version": "1.0.0"\n}\n', '1.0.0', '1.0.1'), '{\n\t"version": "1.0.1"\n}\n')
    assert.equal(rewriteVersion('{"a":{"version":"1.0.0"}}', '1.0.0', '1.0.1'), null)
  })

  test('placeVersionLine puts the line last without trailers, and before the trailers with them', () => {
    assert.equal(placeVersionLine('Add it', 'Version 1.0.0 -> 1.0.1.'), 'Add it\n\nVersion 1.0.0 -> 1.0.1.')
    assert.equal(placeVersionLine('Add it\n\nCo-Authored-By: A <a@example.test>', 'Version 1.0.0 -> 1.0.1.'), 'Add it\n\nVersion 1.0.0 -> 1.0.1.\n\nCo-Authored-By: A <a@example.test>')
  })

  test('versionProblems names a bad bump, an unknown key, a file that is not a .json inside the repository', () => {
    assert.deepEqual(versionProblems({ bump: 'patch', file: 'package.json' }), [])
    assert.match(versionProblems({ bump: 'huge' }).join('\n'), /publish\.version\.bump must be one of patch, minor, major, none/)
    assert.match(versionProblems({ size: 'big' }).join('\n'), /publish\.version\.size is not a setting/)
    assert.match(versionProblems({ file: 'VERSION' }).join('\n'), /publish\.version\.file must be a \.json file inside the repository/)
    assert.match(versionProblems({ file: '../package.json' }).join('\n'), /publish\.version\.file must be a \.json file inside the repository/)
    assert.match(versionProblems({ file: '/abs/package.json' }).join('\n'), /publish\.version\.file must be a \.json file inside the repository/)
    assert.match(versionProblems('minor').join('\n'), /publish\.version must be an object/)
  })

  test('parseSettings: an absent or empty version is no bump; an object gets the defaults', () => {
    assert.equal(parseSettings({ repo: '/r' }).settings.version, null)
    assert.equal(parseSettings({ repo: '/r', version: '' }).settings.version, null)
    assert.deepEqual(parseSettings({ repo: '/r', version: {} }).settings.version, { file: 'package.json', bump: 'patch' })
    assert.deepEqual(parseSettings({ repo: '/r', version: { bump: 'major' } }).settings.version, { file: 'package.json', bump: 'major' })
    assert.match(parseSettings({ repo: '/r', version: { bump: 'huge' } }).problems.join('\n'), /publish\.version\.bump must be one of/)
  })
})
