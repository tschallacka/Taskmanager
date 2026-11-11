import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pkg from '../../package.json'
import { buildCrewKit } from './crewKit'

// The one place the Taskmanager's version is read. /api/health and /api/version both take it from
// here, so the two cannot disagree. package.json is bundled into the server, so it is there at run time.
export const APP_NAME = 'Taskmanager'
export const APP_VERSION: string = pkg.version

// The commit a Blaze deploy writes into a file named REVISION at the release root. The release folder is a
// `git archive` with no .git, so this file is the only place the commit is known at run time.
const REVISION_FILE = 'REVISION'
const SHORT_BUILD_LENGTH = 7

// The 7-character build id read from REVISION in `dir`, or null when the file is missing, unreadable or not a
// hex commit id. It reads the file each time it is called, so the tests can point it at a temporary folder.
export function readRevision(dir: string): string | null {
  let text: string
  try {
    text = readFileSync(join(dir, REVISION_FILE), 'utf8').trim()
  } catch {
    return null
  }
  if (!/^[0-9a-f]{7,40}$/i.test(text)) return null
  return text.slice(0, SHORT_BUILD_LENGTH).toLowerCase()
}

// REVISION is read once per working directory and kept, so a request never touches the disk for it.
const revisionByDir = new Map<string, string | null>()
function revisionHere(): string | null {
  const dir = process.cwd()
  if (!revisionByDir.has(dir)) revisionByDir.set(dir, readRevision(dir))
  return revisionByDir.get(dir) ?? null
}

// The build id: TASKMANAGER_BUILD when the deploy sets it (the nix and Docker paths), else the commit in REVISION
// (the Blaze path), else null. Blaze starts the server in the release folder, where REVISION is, so the file is
// read there at run time rather than copied at build time.
export function appBuild(): string | null {
  return process.env.TASKMANAGER_BUILD?.trim() || revisionHere()
}

// The 12-character version of the crew kit this instance serves, or null when its kit folder is not there.
export function crewKitVersion(): string | null {
  try {
    return buildCrewKit().version
  } catch {
    return null
  }
}

export function versionInfo() {
  return { name: APP_NAME, version: APP_VERSION, build: appBuild(), kit: crewKitVersion() }
}
