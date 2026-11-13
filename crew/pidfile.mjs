// Pid files for the crew's long-running pieces: Pia's board listener (listen.mjs pia) and Boss's two watches
// (crew boss-mentions, crew watch-crew). A process writes its own pid into CREW_HOME/.listen/<name>.pid when it starts.
// A checker reads that file and asks the kernel whether the process is still alive and still the same command, from
// /proc/<pid>/cmdline. No process scan (pgrep -f) is needed. The shell hooks read the same file the same way.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The pid file of a named process: CREW_HOME/.listen/<name>.pid. `home` is the crew home folder. */
export function pidFile(home, name) {
  return join(home, '.listen', `${name}.pid`)
}

/** Writes this process's pid as the named process's pid file. */
export function writePidFile(home, name) {
  mkdirSync(join(home, '.listen'), { recursive: true })
  writeFileSync(pidFile(home, name), `${process.pid}\n`)
}

/** The command line of a process, arguments joined by spaces, or null when it has none (gone, or no /proc). */
export function commandLine(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ').trim()
  } catch {
    return null
  }
}

/**
 * The pid in the named process's pid file, when that process is alive and its command line contains `match`.
 * Null when the file is missing or malformed, the process is gone, or it is some other command (a reused pid).
 */
export function livePid(home, name, match, readCommand = commandLine) {
  let pid
  try {
    pid = Number(readFileSync(pidFile(home, name), 'utf8').trim())
  } catch {
    return null
  }
  if (!Number.isInteger(pid) || pid < 2) return null
  const command = readCommand(pid)
  return command !== null && command.includes(match) ? pid : null
}
