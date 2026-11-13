// A profile folder can still be written by helper processes after the main process has exited. This test pins the
// cleanup: removeWhenUnused waits until no process names the folder, then removes it. It needs no Chromium.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { removeWhenUnused, usersOf } from './browser-cleanup.mjs'

test('a folder that a helper still writes into is removed once the helper is gone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bcl-'))
  const profile = join(dir, 'profile', 'Default')
  mkdirSync(profile, { recursive: true })
  const file = join(profile, 'Cookies')
  // The main shell exits at once; its background loop keeps appending to a file in the folder, like a Chromium helper.
  // The folder path sits in the script text, so the helper's command line names it, as Chromium's does.
  const script = `(while :; do echo x >> "${file}"; sleep 0.005; done) & echo started; exit 0 # ${dir}`
  const main = spawn('sh', ['-c', script], { detached: true, stdio: 'ignore' })
  await new Promise(resolve => main.once('exit', resolve))
  await sleep(100)
  assert.ok(usersOf(dir).length > 0, 'the helper still names the folder')
  // Stop the helper a little after the wait has started, so removeWhenUnused has something to wait for.
  const stop = setTimeout(() => {
    for (const pid of usersOf(dir)) {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        // the process already ended
      }
    }
  }, 300)
  await removeWhenUnused(dir)
  clearTimeout(stop)
  assert.equal(existsSync(dir), false, 'the folder is gone')
  assert.deepEqual(usersOf(dir), [], 'nothing names the folder any more')
})
