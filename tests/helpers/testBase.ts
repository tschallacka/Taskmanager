// Where the tests that talk to a running dev server find it. Port 3000 is usually taken by another
// project, so nothing here assumes it. The order is:
//   1. the test's own variable (CREW_TEST_BASE, GH_SYNC_TEST_BASE, ...)
//   2. TEST_BASE_URL, one variable for every test
//   3. the dev server this checkout started: Nuxt records its port in .nuxt/nuxt.lock
// With none of those, the base is '' and the test skips with noBaseReason().
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '')

interface DevLock {
  pid?: number
  cwd?: string
  port?: number
  command?: string
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** The URL of the `nuxt dev` that runs from this checkout, or '' when none does. */
export function devServerOfThisCheckout(): string {
  try {
    const lock = JSON.parse(readFileSync(`${ROOT}/.nuxt/nuxt.lock`, 'utf8')) as DevLock
    if (lock.command !== 'dev' || !lock.port || !lock.pid || !alive(lock.pid)) return ''
    if (lock.cwd && lock.cwd !== ROOT) return ''
    // Nuxt may bind ::1; localhost reaches either, and is the origin the app trusts in development.
    return `http://localhost:${lock.port}`
  } catch {
    return ''
  }
}

/** The base URL for a test: its own variables first, then TEST_BASE_URL, then this checkout's dev server. '' when none. */
export function resolveTestBase(...ownVariables: string[]): string {
  for (const name of [...ownVariables, 'TEST_BASE_URL']) {
    const value = process.env[name]
    if (value) return value.replace(/\/$/, '')
  }
  return devServerOfThisCheckout()
}

/** The skip reason for a test that found no server. */
export function noBaseReason(...ownVariables: string[]): string {
  return `no dev server found: start nuxt dev in this checkout, or set ${[...ownVariables, 'TEST_BASE_URL'].join(' or ')}`
}
