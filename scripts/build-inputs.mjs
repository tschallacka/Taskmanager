// What the production build reads, and the hash over it (card mwkf0nartlrd5n8lz2o). The build-if-changed wrapper skips the build when
// this hash matches the one the last good build was made from. The list was taken from a file-read trace of `bun run build` (strace of
// origin/master 6a15dbe): the source folders, the help pages under docs/ (bundled into the server), the configs, and the build-time
// environment values. Not inputs: tests, crew/, changelog, the READMEs, nix/, data/, .git (read, but no output depends on it), and the
// generated .nuxt and .output. The version in package.json is not an input: the version is read at run time (appVersionFile.ts).
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export const INPUT_DIRS = ['app', 'server', 'shared', 'public', 'docs']
export const INPUT_FILES = ['nuxt.config.ts', 'tsconfig.json', 'bun.lock', 'package.json', 'eslint.config.mjs', '.gitignore']
const EXCLUDED = /\.(test|spec)\.[cm]?[jt]sx?$/

/**
 * An environment value the build may read (NODE_ENV, the public Nuxt flags, the Vite values). TASKMANAGER_BUILD is not one of them: it
 * is read at run time, and including it would force a build on every release.
 */
export function isBuildEnv(name) {
  return name === 'NODE_ENV' || name.startsWith('NUXT_PUBLIC_') || name.startsWith('VITE_')
}

/** True for a path (relative to the app root, with / separators) that the build reads. */
export function isBuildInput(rel) {
  const path = rel.split(sep).join('/')
  if (EXCLUDED.test(path)) return false
  if (INPUT_FILES.includes(path)) return true
  return INPUT_DIRS.some(dir => path.startsWith(`${dir}/`))
}

// package.json with its version removed: a version bump alone must not change the hash.
function comparable(path, buf) {
  if (path !== 'package.json') return buf
  const json = JSON.parse(buf.toString('utf8'))
  delete json.version
  return Buffer.from(JSON.stringify(json))
}

/**
 * The hash over the build inputs. `files` maps a relative path to its content (a string or a Buffer); only the build inputs count. `env`
 * holds the environment; only the build-time values count. `bun` and `node` are the tool versions: a new tool forces a build.
 */
// The format of the cached output. Raise it when the way the cache is written or restored changes: every older cache then no longer
// matches and the next deploy builds in full. 2: the output is copied with its symlinks resolved (Nitro's output holds symlinks with
// absolute targets into the release that built it; a copy that kept them pointed into a release the deploy later pruned).
export const CACHE_FORMAT = 2

export function hashInputs(files, { bun = '', node = '', env = {} } = {}) {
  const h = createHash('sha256')
  h.update(`cache-format ${CACHE_FORMAT}\nbun ${bun}\nnode ${node}\n`)
  for (const name of Object.keys(files).filter(isBuildInput).sort()) {
    const raw = Buffer.isBuffer(files[name]) ? files[name] : Buffer.from(files[name])
    const buf = comparable(name.split(sep).join('/'), raw)
    h.update(`file ${name} ${buf.length}\n`)
    h.update(buf)
    h.update('\n')
  }
  for (const name of Object.keys(env).filter(isBuildEnv).sort()) {
    h.update(`env ${name}=${env[name]}\n`)
  }
  return h.digest('hex')
}

/** Reads the build inputs under `root` (only the input folders and files; node_modules and the generated folders are never walked). */
export function readInputs(root) {
  const files = {}
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const rel = relative(root, full)
      if (statSync(full).isDirectory()) walk(full)
      else if (isBuildInput(rel)) files[rel.split(sep).join('/')] = readFileSync(full)
    }
  }
  for (const dir of INPUT_DIRS) if (existsSync(join(root, dir))) walk(join(root, dir))
  for (const file of INPUT_FILES) if (existsSync(join(root, file))) files[file] = readFileSync(join(root, file))
  return files
}

/** The hash of the build inputs under `root`, with the tool versions and the environment. */
export function hashTree(root, { bun = '', node = '', env = {} } = {}) {
  return hashInputs(readInputs(root), { bun, node, env })
}
