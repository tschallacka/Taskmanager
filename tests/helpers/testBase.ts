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

/** The database name in a DATABASE_URL (never the user or password), or null when there is none or it does not parse. */
export function databaseNameOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
    return name || null
  } catch {
    return null
  }
}

/** The database a process was started with, read from its environment (names only), or null when it cannot be read. */
export function databaseNameOfPid(pid: number, read: (pid: number) => string = p => readFileSync(`/proc/${p}/environ`, 'utf8')): string | null {
  try {
    const entry = read(pid).split('\0').find(e => e.startsWith('DATABASE_URL='))
    return entry ? databaseNameOf(entry.slice('DATABASE_URL='.length)) : null
  } catch {
    return null
  }
}

/**
 * Whether a dev server runs on another database than the test's own. Only a known pair that differs counts: a test
 * that writes to one database while the server writes to another fails with foreign-key errors that look like a schema
 * problem, so the test skips and says why instead.
 */
export function devServerUsesOtherDatabase(ours: string | null, theirs: string | null): boolean {
  return Boolean(ours && theirs && ours !== theirs)
}

let lastMismatch: { ours: string, theirs: string } | null = null

/** The URL of the `nuxt dev` that runs from this checkout, or '' when none does, or when it uses another database. */
export function devServerOfThisCheckout(): string {
  lastMismatch = null
  try {
    const lock = JSON.parse(readFileSync(`${ROOT}/.nuxt/nuxt.lock`, 'utf8')) as DevLock
    if (lock.command !== 'dev' || !lock.port || !lock.pid || !alive(lock.pid)) return ''
    if (lock.cwd && lock.cwd !== ROOT) return ''
    const ours = databaseNameOf(process.env.DATABASE_URL)
    const theirs = databaseNameOfPid(lock.pid)
    if (devServerUsesOtherDatabase(ours, theirs)) {
      lastMismatch = { ours: ours!, theirs: theirs! }
      return ''
    }
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

/** The skip reason for a test that found no server, or found one on another database. */
export function noBaseReason(...ownVariables: string[]): string {
  if (lastMismatch) {
    return `the dev copy in this checkout uses database "${lastMismatch.theirs}", not "${lastMismatch.ours}": a test would write to the wrong database. Stop that dev copy, or set ${[...ownVariables, 'TEST_BASE_URL'].join(' or ')}`
  }
  return `no dev server found: start nuxt dev in this checkout, or set ${[...ownVariables, 'TEST_BASE_URL'].join(' or ')}`
}
