// The skip-or-build decision and the wrapper (scripts/build-if-changed.mjs, card mwkf0nartlrd5n8lz2o). Temp folders and a fake build
// that writes a fake .output and counts its calls: nothing real is built here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cacheDirFor, decide, formatLine, run } from '../scripts/build-if-changed.mjs'

const GOOD = { hash: 'abc123', entry: true, version: true }

test('a matching, complete cache is a skip', () => {
  assert.equal(decide({ force: false, hash: 'abc123', cache: GOOD }).action, 'skip')
})

test('a different hash is a build', () => {
  assert.equal(decide({ force: false, hash: 'zzz999', cache: GOOD }).action, 'build')
})

test('no cache is a build', () => {
  assert.equal(decide({ force: false, hash: 'abc123', cache: null }).action, 'build')
})

test('a cache with no entry file is a build, and the cache is dropped', () => {
  const d = decide({ force: false, hash: 'abc123', cache: { ...GOOD, entry: false } })
  assert.equal(d.action, 'build')
  assert.equal(d.dropCache, true)
})

test('a cache with no VERSION file is a build, and the cache is dropped', () => {
  const d = decide({ force: false, hash: 'abc123', cache: { ...GOOD, version: false } })
  assert.equal(d.action, 'build')
  assert.equal(d.dropCache, true)
})

test('an unreadable hash (null) is a build', () => {
  assert.equal(decide({ force: false, hash: 'abc123', cache: { ...GOOD, hash: null } }).action, 'build')
})

test('BUILD_FORCE=1 is a build even when the cache matches', () => {
  assert.equal(decide({ force: true, hash: 'abc123', cache: GOOD }).action, 'build')
})

test('the log line has the agreed shape', () => {
  const line = formatLine({ action: 'skipped', hash: 'abcdef0123456789', wallS: 1.23, cpuS: 0.5, peakMB: 120.4 })
  assert.equal(line, 'build-if-changed: skipped, hash abcdef012345, wall 1.2s, cpu 0.5s, peak 120 MB')
  assert.match(formatLine({ action: 'built', hash: 'x', wallS: 540, cpuS: 610, peakMB: 3600 }), /^build-if-changed: built, hash x, wall 540\.0s, cpu 610\.0s, peak 3600 MB$/)
})

// A fake release: the inputs, a package.json with a version, and a fake build that writes a complete .output.
function release(version = '0.39.4') {
  const root = mkdtempSync(join(tmpdir(), 'bic-release-'))
  for (const [file, text] of Object.entries({
    'app/pages/index.vue': '<template>home</template>',
    'server/api/x.ts': 'export default 1',
    'nuxt.config.ts': 'export default {}',
    'package.json': JSON.stringify({ name: 'app', version, dependencies: {} }, null, 2),
    'bun.lock': 'lock',
    'tsconfig.json': '{}'
  })) {
    mkdirSync(join(root, file, '..'), { recursive: true })
    writeFileSync(join(root, file), text)
  }
  return root
}

function fakeBuild(root, { fail = false } = {}) {
  const counter = { calls: 0 }
  const build = () => {
    counter.calls += 1
    if (fail) return { status: 1 }
    mkdirSync(join(root, '.output', 'server'), { recursive: true })
    mkdirSync(join(root, '.output', 'public'), { recursive: true })
    writeFileSync(join(root, '.output', 'server', 'index.mjs'), `// built ${counter.calls}`)
    writeFileSync(join(root, '.output', 'public', 'index.html'), '<html>')
    return { status: 0 }
  }
  return { build, counter }
}

test('a first run builds; a second run with the same inputs skips and does not build again', () => {
  const root = release()
  const { build, counter } = fakeBuild(root)
  assert.equal(run({ root, env: {}, build }).action, 'built')
  assert.equal(counter.calls, 1)
  assert.equal(run({ root, env: {}, build }).action, 'skipped')
  assert.equal(counter.calls, 1, 'no second build')
  assert.ok(existsSync(join(root, '.output', 'server', 'index.mjs')), 'the output is there after the skip')
})

test('a changed app file builds again', () => {
  const root = release()
  const { build, counter } = fakeBuild(root)
  run({ root, env: {}, build })
  writeFileSync(join(root, 'app', 'pages', 'index.vue'), '<template>changed</template>')
  assert.equal(run({ root, env: {}, build }).action, 'built')
  assert.equal(counter.calls, 2)
})

test('a release that only bumps the version skips, and its VERSION file names the new version', () => {
  const root = release('0.39.4')
  const { build, counter } = fakeBuild(root)
  run({ root, env: {}, build })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', version: '0.39.5', dependencies: {} }, null, 2))
  assert.equal(run({ root, env: {}, build }).action, 'skipped')
  assert.equal(counter.calls, 1)
  assert.equal(readFileSync(join(root, '.output', 'VERSION'), 'utf8').trim(), '0.39.5', 'the copied output reports the new version')
})

test('a cache whose entry file is gone is not trusted: the run builds, and the cache is replaced', () => {
  const root = release()
  const { build, counter } = fakeBuild(root)
  run({ root, env: {}, build })
  rmSync(join(root, 'data', '.build-cache', 'output', 'server', 'index.mjs'))
  assert.equal(run({ root, env: {}, build }).action, 'built')
  assert.equal(counter.calls, 2)
})

test('BUILD_FORCE=1 builds even when the cache matches', () => {
  const root = release()
  const { build, counter } = fakeBuild(root)
  run({ root, env: {}, build })
  assert.equal(run({ root, env: { BUILD_FORCE: '1' }, build }).action, 'built')
  assert.equal(counter.calls, 2)
})

test('a failed build exits with its status, leaves the cache for the old inputs, and the next run builds', () => {
  const root = release()
  const failing = fakeBuild(root, { fail: true })
  const res = run({ root, env: {}, build: failing.build })
  assert.equal(res.status, 1)
  const ok = fakeBuild(root)
  assert.equal(run({ root, env: {}, build: ok.build }).action, 'built')
  assert.equal(ok.counter.calls, 1)
})

test('CONTRIBUTING.md (Releases) says what the build cache is and how to force a build', () => {
  const text = readFileSync(join(process.cwd(), 'CONTRIBUTING.md'), 'utf8')
  assert.match(text, /build cache/)
  assert.match(text, /BUILD_FORCE=1/)
  assert.match(text, /data\/\.build-cache/)
})

// The copy hardening (card mwkf0nartlrd5n8lz2o, after the 502): a link in .output must not reach the cache or a skip as it is.
test('a cache that holds an absolute link is not skipped: the run builds, and the reason is printed', () => {
  const root = release()
  const { build, counter } = fakeBuild(root)
  run({ root, env: {}, build })
  symlinkSync(join(root, 'nix', '..', 'package.json'), join(root, 'data', '.build-cache', 'output', 'server', 'abs-link.json'))
  const lines: string[] = []
  assert.equal(run({ root, env: {}, build, log: l => lines.push(l) }).action, 'built')
  assert.equal(counter.calls, 2, 'the cache with an absolute link was not used')
  assert.match(lines.join('\n'), /full build: .*absolute link/)
})

test('a cache with a link that leaves .output is not skipped, and the reason is printed', () => {
  const root = release()
  const { build, counter } = fakeBuild(root)
  run({ root, env: {}, build })
  symlinkSync('../../../../../../etc', join(root, 'data', '.build-cache', 'output', 'server', 'out-link'))
  const lines: string[] = []
  assert.equal(run({ root, env: {}, build, log: l => lines.push(l) }).action, 'built')
  assert.equal(counter.calls, 2)
  assert.match(lines.join('\n'), /full build: .*leaves \.output/)
})

test('a cache with a broken link is not skipped, and the reason is printed', () => {
  const root = release()
  const { build, counter } = fakeBuild(root)
  run({ root, env: {}, build })
  symlinkSync('missing.mjs', join(root, 'data', '.build-cache', 'output', 'server', 'broken-link.mjs'))
  const lines: string[] = []
  assert.equal(run({ root, env: {}, build, log: l => lines.push(l) }).action, 'built')
  assert.equal(counter.calls, 2)
  assert.match(lines.join('\n'), /full build: .*broken/)
})

test('the output is stored dereferenced: a link in the build does not reach the cache as a link', () => {
  const root = release()
  const linkingBuild = () => {
    mkdirSync(join(root, '.output', 'server'), { recursive: true })
    mkdirSync(join(root, '.output', 'public'), { recursive: true })
    writeFileSync(join(root, '.output', 'server', 'index.mjs'), '// built')
    writeFileSync(join(root, '.output', 'public', 'index.html'), '<html>')
    symlinkSync(join(root, '.output', 'server', 'index.mjs'), join(root, '.output', 'server', 'alias.mjs'))
    return { status: 0 }
  }
  run({ root, env: {}, build: linkingBuild })
  assert.equal(lstatSync(join(root, 'data', '.build-cache', 'output', 'server', 'alias.mjs')).isSymbolicLink(), false, 'the cached copy is a file')
  assert.equal(readFileSync(join(root, 'data', '.build-cache', 'output', 'server', 'alias.mjs'), 'utf8'), '// built')
})

test('a build whose output names the build root is not stored, the reason is printed, and the next run builds again', () => {
  const root = release()
  const baking = () => {
    mkdirSync(join(root, '.output', 'server'), { recursive: true })
    mkdirSync(join(root, '.output', 'public'), { recursive: true })
    writeFileSync(join(root, '.output', 'server', 'index.mjs'), `// from ${root}`)
    writeFileSync(join(root, '.output', 'public', 'index.html'), '<html>')
    return { status: 0 }
  }
  const lines: string[] = []
  assert.equal(run({ root, env: {}, build: baking, log: l => lines.push(l) }).action, 'built')
  assert.match(lines.join('\n'), /not stored: .*build root/)
  const { build, counter } = fakeBuild(root)
  assert.equal(run({ root, env: {}, build }).action, 'built', 'nothing was stored, so nothing is skipped')
  assert.equal(counter.calls, 1)
})

test('the full-build reason is printed before the build (no cache, a changed input, BUILD_FORCE)', () => {
  const root = release()
  const { build } = fakeBuild(root)
  const lines: string[] = []
  run({ root, env: {}, build, log: l => lines.push(l) })
  assert.match(lines.join('\n'), /full build: no cache/)
})

// Nina's must (card mwkf0nartlrd5n8lz2o): the cache inside the release is removed with it on each deploy. The deploy keeps the cache
// outside every release (BUILD_CACHE_DIR), so the next release with the same inputs skips.
test('a cache outside the release (BUILD_CACHE_DIR) survives the deploy: the next release with the same inputs skips', () => {
  const shared = mkdtempSync(join(tmpdir(), 'bic-shared-'))
  const first = release()
  const a = fakeBuild(first)
  assert.equal(run({ root: first, env: { BUILD_CACHE_DIR: shared }, build: a.build }).action, 'built')
  assert.equal(a.counter.calls, 1)
  rmSync(first, { recursive: true, force: true }) // the deploy removes the old release
  const second = release()
  const b = fakeBuild(second)
  assert.equal(run({ root: second, env: { BUILD_CACHE_DIR: shared }, build: b.build }).action, 'skipped')
  assert.equal(b.counter.calls, 0, 'no build in the new release')
  assert.ok(existsSync(join(second, '.output', 'server', 'index.mjs')), 'the output is in the new release')
})

test('the cache is in BUILD_CACHE_DIR when it is set, and in data/.build-cache of the release when it is not', () => {
  assert.equal(cacheDirFor('/rel/a', { BUILD_CACHE_DIR: '/var/lib/tm/build-cache' }), '/var/lib/tm/build-cache')
  assert.equal(cacheDirFor('/rel/a', {}), join('/rel/a', 'data', '.build-cache'))
})

// The must: each deploy builds a new release folder (a new git worktree), so a cache inside the release is gone on the next one.
test('a second release folder with the same inputs skips when the cache is in BUILD_CACHE_DIR', () => {
  const cache = mkdtempSync(join(tmpdir(), 'bic-shared-cache-'))
  const first = release()
  assert.equal(run({ root: first, env: { BUILD_CACHE_DIR: cache }, build: fakeBuild(first).build }).action, 'built')
  const second = release()
  const { build, counter } = fakeBuild(second)
  assert.equal(run({ root: second, env: { BUILD_CACHE_DIR: cache }, build }).action, 'skipped')
  assert.equal(counter.calls, 0, 'the new release copies the cached output and does not build')
  assert.ok(existsSync(join(second, '.output', 'server', 'index.mjs')))
})

test('a run that changes only nix/hashes.json skips', () => {
  const root = release()
  const { build, counter } = fakeBuild(root)
  run({ root, env: {}, build })
  mkdirSync(join(root, 'nix'), { recursive: true })
  writeFileSync(join(root, 'nix', 'hashes.json'), '{"x":"1"}')
  assert.equal(run({ root, env: {}, build }).action, 'skipped')
  assert.equal(counter.calls, 1)
})
