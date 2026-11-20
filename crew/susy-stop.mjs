// The stop marker of Susy's daemon (card mwnzgxz5uschuba1y7): a file in the crew home that says Susy is stopped on purpose.
// `crew susy-daemon stop` writes it, `start` clears it, and the Pia and Susy watch reads it so it does not report Susy down.
// A module of its own, so the watch does not load the detection code.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function stopMarkerPath(home) {
  return join(home, '.listen', 'susy-daemon.stopped')
}

export function isStopped(home) {
  return existsSync(stopMarkerPath(home))
}

/** Writes or clears the stop marker. Clearing a marker that is not there is not an error. */
export function setStopped(home, stopped) {
  if (stopped) {
    mkdirSync(join(home, '.listen'), { recursive: true })
    writeFileSync(stopMarkerPath(home), `${new Date().toISOString()}\n`, { mode: 0o600 })
  } else {
    rmSync(stopMarkerPath(home), { force: true })
  }
}
