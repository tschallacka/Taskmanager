import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The version the running server reports (card mwkf0nartlrd5n8lz2o). It is read at run time, so a build copied from the cache (a
// skipped build) still reports the version of its own release. In order: the VERSION file the build wrapper writes into .output, the
// package.json of the release (the working folder), and only then the value bundled at build time (dev).
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

function fromVersionFile(file: string): string | null {
  if (!existsSync(file)) return null
  const text = readFileSync(file, 'utf8').trim()
  return VERSION_RE.test(text) ? text : null
}

function fromPackageJson(file: string): string | null {
  if (!existsSync(file)) return null
  try {
    const version = JSON.parse(readFileSync(file, 'utf8')).version
    return typeof version === 'string' && VERSION_RE.test(version) ? version : null
  } catch {
    return null
  }
}

/**
 * The version of the release the server runs: `release` (TASKMANAGER_RELEASE, set by run-server.sh; the server runs from state/, not
 * from its release), else the working folder `cwd`. `bundled` is the last resort.
 */
export function readAppVersion({ cwd, release = cwd, bundled }: { cwd: string, release?: string, bundled: string }): string {
  return fromVersionFile(join(release, '.output', 'VERSION'))
    ?? fromPackageJson(join(release, 'package.json'))
    ?? bundled
}
