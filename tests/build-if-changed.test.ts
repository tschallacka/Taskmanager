// The skip-or-build decision and the wrapper (scripts/build-if-changed.mjs, card mwkf0nartlrd5n8lz2o). Temp folders and a fake build
// that writes a fake .output and counts its calls: nothing real is built here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { decide, formatLine, run } from '../scripts/build-if-changed.mjs'

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

test('a run that changes only nix/hashes.json skips', () => {
  const root = release()
  const { build, counter } = fakeBuild(root)
  run({ root, env: {}, build })
  mkdirSync(join(root, 'nix'), { recursive: true })
  writeFileSync(join(root, 'nix', 'hashes.json'), '{"x":"1"}')
  assert.equal(run({ root, env: {}, build }).action, 'skipped')
  assert.equal(counter.calls, 1)
})
