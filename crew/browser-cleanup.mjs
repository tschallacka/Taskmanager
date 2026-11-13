// Removes a test's scratch folder once no process still uses it. Chromium's helper processes can outlive the main one and
// keep writing into the profile, so a recursive remove can meet a new file and fail with ENOTEMPTY. A process uses the
// folder when its command line names it (the profile is passed as --user-data-dir, and the driver as its state folder).
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

/** The pids whose command line names the folder, other than this process. Linux only: it reads /proc. */
export function usersOf(dir) {
  const hits = []
  for (const pid of readdirSync('/proc')) {
    if (!/^\d+$/.test(pid) || Number(pid) === process.pid) continue
    try {
      // An argument names the folder when it is the folder, ends with it (--user-data-dir=<dir>, or a script that ends
      // with it) or has a path under it. A sibling such as <dir>x does not match.
      const named = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')
        .some(arg => arg === dir || arg.endsWith(dir) || arg.includes(`${dir}/`))
      if (named) hits.push(Number(pid))
    } catch {
      // the process ended while it was read
    }
  }
  return hits
}

/** Wait until nothing uses the folder (up to waitMs), then remove it with retries. */
export async function removeWhenUnused(dir, waitMs = 15000) {
  const until = Date.now() + waitMs
  while (usersOf(dir).length && Date.now() < until) await sleep(50)
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
