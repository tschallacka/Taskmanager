import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

// The version the running server reports (card mwkf0nartlrd5n8lz2o). It is read at run time, so a build copied from the cache (a
// skipped build) still reports the version of its own release. In order: the VERSION file of the release the running code is in,
// the VERSION file and package.json of the release the server names (TASKMANAGER_RELEASE, the working folder otherwise), and only
// then the value bundled at build time (dev).
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

// The VERSION file of the release the running code is in: the first `.output` folder above `moduleDir` that has one. A
// supervisor may start the server from another folder, so the working folder is only the second choice.
function fromOwnRelease(moduleDir: string): string | null {
  let dir = moduleDir
  for (;;) {
    if (basename(dir) === '.output') {
      const version = fromVersionFile(join(dir, 'VERSION'))
      if (version !== null) return version
    }
    const up = dirname(dir)
    if (up === dir) return null
    dir = up
  }
}

/**
 * The version for the release the server runs: its own release (`moduleDir`, the folder of the running code), then the release the
 * server names (`release`, TASKMANAGER_RELEASE, set by run-server.sh; the server runs from state/), then the working folder `cwd`,
 * with `bundled` as the last resort.
 */
export function readAppVersion({ cwd, release = cwd, bundled, moduleDir }: { cwd: string, release?: string, bundled: string, moduleDir?: string }): string {
  return (moduleDir ? fromOwnRelease(moduleDir) : null)
    ?? fromVersionFile(join(release, '.output', 'VERSION'))
    ?? fromPackageJson(join(release, 'package.json'))
    ?? bundled
}
