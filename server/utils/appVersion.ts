import pkg from '../../package.json'
import { buildCrewKit } from './crewKit'

// The one place the Taskmanager's version is read. /api/health and /api/version both take it from
// here, so the two cannot disagree. package.json is bundled into the server, so it is there at run time.
export const APP_NAME = 'Taskmanager'
export const APP_VERSION: string = pkg.version

// The build id the deploy provides in TASKMANAGER_BUILD (a short commit or a build number), else null.
export function appBuild(): string | null {
  return process.env.TASKMANAGER_BUILD?.trim() || null
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
