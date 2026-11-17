#!/usr/bin/env node
// The production build, skipped when nothing it reads has changed (card mwkf0nartlrd5n8lz2o). The deploy runs `bun run build`, which
// runs this file. If the build inputs (scripts/build-inputs.mjs) hash to the value the last good build was made from, and that build's
// output is still there, the output is copied to .output and the build is skipped. Otherwise the real build runs (`build:full`) and its
// output becomes the cache. Any doubt runs the real build. BUILD_FORCE=1 always runs it.
// Cache: data/.build-cache/inputs.sha256 (the hash) and data/.build-cache/output (a copy of .output). data/ is the one path kept between
// releases on the server. Every run prints one line: build-if-changed: skipped|built|failed, hash <12>, wall Ns, cpu Ns, peak MB.
// Links: every copy dereferences symlinks (a link is stored as the file it points at), and a tree with an absolute link, a link that
// leaves .output, a broken link, or a text file that names the build root is never skipped and never stored. The reason is printed.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashTree } from './build-inputs.mjs'

const ENTRY = join('server', 'index.mjs')
const VERSION = 'VERSION'
// The text files a build writes: the build root must not be named in any of them (a copy made elsewhere would point back here).
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.json', '.html', '.map', '.css', '.txt', '.md', '.ts'])

/**
 * The decision, from the hash of the inputs now and the state of the cache. `cache` is null when there is no cache, else
 * { hash (the stored hash, or null when unreadable), entry (the entry file exists), version (the VERSION file exists) }.
 */
export function decide({ force, hash, cache }) {
  if (force) return { action: 'build', reason: 'BUILD_FORCE=1' }
  if (!cache) return { action: 'build', reason: 'no cache' }
  if (!cache.entry || !cache.version) return { action: 'build', reason: 'the cached output is incomplete', dropCache: true }
  if (cache.hash === null) return { action: 'build', reason: 'the cached hash is unreadable' }
  if (cache.hash !== hash) return { action: 'build', reason: 'the build inputs changed' }
  return { action: 'skip', reason: 'the build inputs did not change' }
}

/**
 * What stops a tree from being copied and skipped with: null when it is safe, else one sentence. The tree is `outDir`; `root` is the
 * build root it was made in. A link is refused when it is absolute, when it resolves outside `outDir`, or when it is broken.
 */
export function treeProblem(outDir, root) {
  if (!existsSync(join(outDir, ENTRY))) return `the output has no ${ENTRY}`
  if (!existsSync(join(outDir, VERSION))) return `the output has no ${VERSION} file`
  let problem = null
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (problem) return
      const full = join(dir, entry.name)
      const rel = relative(outDir, full)
      if (entry.isSymbolicLink()) {
        const target = readlinkSync(full)
        if (isAbsolute(target)) problem = `absolute link ${rel}`
        else if (relative(outDir, resolve(dirname(full), target)).startsWith('..')) problem = `link ${rel} leaves .output`
        else if (!existsSync(full)) problem = `broken link ${rel}`
      } else if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile() && TEXT_EXT.has(extname(entry.name)) && root && readFileSync(full, 'utf8').includes(root)) {
        problem = `${rel} names the build root`
      }
    }
  }
  walk(outDir)
  return problem
}

/** The one line the deploy log gets for every run. */
export function formatLine({ action, hash, wallS, cpuS, peakMB }) {
  return `build-if-changed: ${action}, hash ${String(hash).slice(0, 12)}, wall ${wallS.toFixed(1)}s, cpu ${cpuS.toFixed(1)}s, peak ${Math.round(peakMB)} MB`
}

function cacheState(cacheDir) {
  const outDir = join(cacheDir, 'output')
  if (!existsSync(outDir)) return null
  let hash = null
  try {
    hash = readFileSync(join(cacheDir, 'inputs.sha256'), 'utf8').trim() || null
  } catch {
    hash = null
  }
  return { hash, entry: existsSync(join(outDir, ENTRY)), version: existsSync(join(outDir, VERSION)) }
}

// The version of this release, from its own package.json: written beside the output after a build and after a copy.
function writeVersion(root) {
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
  writeFileSync(join(root, '.output', VERSION), `${version}\n`)
}

// The cache is written only after a good build, in a temp folder first, then renamed into place: a half-written cache is never used.
// The copy dereferences links, and the copy is checked before it replaces the cache. A refused or failed copy leaves no cache for
// the old inputs either, so nothing can be skipped against it. Returns true when the cache was stored.
function storeCache(root, cacheDir, hash, log) {
  mkdirSync(cacheDir, { recursive: true })
  const tmp = mkdtempSync(join(cacheDir, '.tmp-'))
  try {
    cpSync(join(root, '.output'), join(tmp, 'output'), { recursive: true, dereference: true })
    const bad = treeProblem(join(tmp, 'output'), root)
    if (bad) {
      log(`build-if-changed: not stored: ${bad}`)
      rmSync(join(cacheDir, 'inputs.sha256'), { force: true })
      return false
    }
    rmSync(join(cacheDir, 'output'), { recursive: true, force: true })
    renameSync(join(tmp, 'output'), join(cacheDir, 'output'))
    writeFileSync(join(cacheDir, 'inputs.sha256.tmp'), `${hash}\n`)
    renameSync(join(cacheDir, 'inputs.sha256.tmp'), join(cacheDir, 'inputs.sha256'))
    return true
  } catch (error) {
    log(`build-if-changed: not stored, the copy failed: ${error.message}`)
    rmSync(join(cacheDir, 'inputs.sha256'), { force: true })
    return false
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/**
 * Runs the wrapper for the app at `root`. `build(root)` runs the real build and returns { status, cpuS, peakMB }. Returns
 * { action, status, hash }. Logs one line through `log`, and a line with the reason for every full build.
 */
export function run({ root, env = {}, build, bunVersion = '', nodeVersion = '', log = console.log }) {
  const start = Date.now()
  const hash = hashTree(root, { bun: bunVersion, node: nodeVersion, env })
  const cacheDir = join(root, 'data', '.build-cache')
  const cache = cacheState(cacheDir)
  let d = decide({ force: env.BUILD_FORCE === '1', hash, cache })
  if (d.dropCache) rmSync(cacheDir, { recursive: true, force: true })
  if (d.action === 'skip') {
    // The cache is checked before it is trusted: a link in it (an absolute one, or one that leaves it) is a doubt.
    const bad = treeProblem(join(cacheDir, 'output'), root)
    if (bad) d = { action: 'build', reason: `the cached output: ${bad}` }
  }
  const line = (action, cpuS = 0, peakMB = 0) => log(formatLine({ action, hash, wallS: (Date.now() - start) / 1000, cpuS, peakMB }))
  if (d.action === 'skip') {
    try {
      rmSync(join(root, '.output'), { recursive: true, force: true })
      cpSync(join(cacheDir, 'output'), join(root, '.output'), { recursive: true, dereference: true })
      writeVersion(root)
      const bad = treeProblem(join(root, '.output'), root)
      if (bad) throw new Error(bad)
      line('skipped')
      return { action: 'skipped', status: 0, hash }
    } catch (error) {
      // A copy that fails, or a tree that is not safe, is a doubt: the real build runs below.
      rmSync(join(root, '.output'), { recursive: true, force: true })
      d = { action: 'build', reason: `the copy was refused: ${error.message}` }
    }
  }
  log(`build-if-changed: full build: ${d.reason}`)
  const res = build(root)
  if (res.status !== 0) {
    log(`build-if-changed: failed, hash ${hash.slice(0, 12)}, the build exited ${res.status}`)
    return { action: 'failed', status: res.status, hash }
  }
  if (!existsSync(join(root, '.output', ENTRY))) {
    log(`build-if-changed: failed, hash ${hash.slice(0, 12)}, the build left no ${ENTRY}`)
    return { action: 'failed', status: 1, hash }
  }
  writeVersion(root)
  storeCache(root, cacheDir, hash, log)
  line('built', res.cpuS ?? 0, res.peakMB ?? 0)
  return { action: 'built', status: 0, hash }
}

// The real build: `build:full`, measured with /usr/bin/time when it exists (CPU and peak memory of the build's own processes).
export function realBuild(root) {
  const timed = existsSync('/usr/bin/time')
  const dir = mkdtempSync(join(tmpdir(), 'build-time-'))
  const report = join(dir, 'time.txt')
  const cmd = timed ? '/usr/bin/time' : 'bun'
  const args = timed ? ['-v', '-o', report, 'bun', 'run', 'build:full'] : ['run', 'build:full']
  const run = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' })
  let cpuS = 0
  let peakMB = 0
  if (timed && existsSync(report)) {
    const text = readFileSync(report, 'utf8')
    const num = name => Number((new RegExp(`${name}[^:]*: ([0-9.]+)`).exec(text) ?? [])[1] ?? 0)
    cpuS = num('User time \\(seconds\\)') + num('System time \\(seconds\\)')
    peakMB = num('Maximum resident set size \\(kbytes\\)') / 1024
  }
  rmSync(dir, { recursive: true, force: true })
  return { status: run.status ?? 1, cpuS, peakMB }
}

function toolVersion(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : ''
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = process.cwd()
  const res = run({
    root,
    env: process.env,
    build: realBuild,
    bunVersion: toolVersion('bun', ['--version']),
    nodeVersion: process.versions.node
  })
  process.exit(res.status)
}
