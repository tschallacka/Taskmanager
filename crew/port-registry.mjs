// The port registry of the crew's dev copies: which worktree holds which port, in <CREW_HOME>/.listen/ports.json.
// One entry per port: { worktree, branch, task, who, pid, started }. pid is null for a reservation that has no copy
// running yet (prepare worktree makes one). Writers take one lock file, so two commands never write at once.
// The planning functions are pure (they take the registry and an `alive` test), so the tests need no process.

import fs from 'node:fs'
import { dirname, join } from 'node:path'

/** The registry file under the crew home. */
export function registryFile(crewHome) {
  return join(crewHome, '.listen', 'ports.json')
}

/** The port a person's dev copy uses, from crew.json devServers. Null when the person has none. */
export function portOf(config, who) {
  const port = config?.devServers?.[who]
  return Number.isInteger(port) && port > 0 ? port : null
}

/** The task id in a branch name such as wren/mwdlkxb56xr2ek89g92-prepare-worktree, or null. */
export function taskOfBranch(branch) {
  const match = /(?:^|[\/-])(m[a-z0-9]{18,})(?:-|$)/.exec(String(branch ?? ''))
  return match ? match[1] : null
}

/** Reads the registry; a missing or broken file is an empty registry. */
export function readRegistry(file) {
  try {
    const reg = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (reg && typeof reg === 'object' && reg.ports && typeof reg.ports === 'object') return reg
  } catch {
    // no registry yet, or a broken one: start from empty
  }
  return { ports: {} }
}

export function writeRegistry(file, reg) {
  fs.mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(reg, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

/** Whether an entry holds its port: a reservation always does, a copy does while its process runs. */
export function held(entry, alive) {
  return Boolean(entry) && (entry.pid == null || alive(entry.pid))
}

/** The registry without the entries whose process is gone. Returns the new registry and the dropped ports. */
export function pruned(reg, alive) {
  const ports = {}
  const dropped = []
  for (const [port, entry] of Object.entries(reg.ports)) {
    if (held(entry, alive)) ports[port] = entry
    else dropped.push(Number(port))
  }
  return { reg: { ports }, dropped }
}

/**
 * Plans a reservation or a start for one worktree on one port. `replace` lets the same person's own copy on that port
 * be stopped (its pid is returned as `stop`); another person's copy is never touched.
 */
export function planReserve({ reg, port, who, worktree, branch, task, pid = null, alive, replace = false, now = new Date() }) {
  const current = reg.ports[port]
  if (current && current.worktree === worktree && held(current, alive)) {
    return { ok: true, same: true, stop: null, next: { ...reg, ports: { ...reg.ports, [port]: { ...current, pid: pid ?? current.pid } } } }
  }
  let stop = null
  if (current && held(current, alive)) {
    const who_ = current.who ?? 'someone'
    if (!replace || current.who !== who) {
      return {
        ok: false,
        message: `port ${port} is held by ${who_}'s worktree ${current.worktree} (branch ${current.branch ?? '?'}, card ${current.task ?? '?'}). Stop it with "crew ${who_} serve --stop" in that worktree, or run this with --replace to stop your own old copy.`
      }
    }
    stop = current.pid ?? null
  }
  const entry = { worktree, branch: branch ?? null, task: task ?? null, who, pid, started: now.toISOString() }
  return { ok: true, same: false, stop, next: { ...reg, ports: { ...reg.ports, [port]: entry } } }
}

/** Plans a release: only the holder of a port (its worktree) frees it. */
export function planRelease({ reg, port, worktree }) {
  const current = reg.ports[port]
  if (!current) return { ok: true, noop: true, stop: null, next: reg }
  if (current.worktree !== worktree) {
    return { ok: false, message: `port ${port} is held by ${current.worktree}, not by ${worktree}; it is not freed.` }
  }
  const ports = { ...reg.ports }
  delete ports[port]
  return { ok: true, noop: false, stop: current.pid ?? null, next: { ...reg, ports } }
}

/** Whether a process id runs (EPERM means it runs under another user). */
export function aliveProcess(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

/** Stops a copy's whole process group (the shell and the server it started). A dead pid is not an error. */
export function stopGroup(pid, signal = 'SIGTERM') {
  if (pid == null) return
  try {
    process.kill(-pid, signal)
  } catch {
    try {
      process.kill(pid, signal)
    } catch {
      // already gone
    }
  }
}

/** The pid that listens on a TCP port, from `ss -H -ltnp` output, or null. */
export function listenerPid(ssOutput) {
  const match = /pid=(\d+)/.exec(String(ssOutput ?? ''))
  return match ? Number(match[1]) : null
}

const sleepMs = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/**
 * Runs fn while holding the registry lock (a lock file created exclusively, with the owner's pid). A lock whose
 * owner is gone, or older than 30 s, is stale and taken over. Waits up to 10 s, then throws.
 */
export function withLock(file, fn, { alive = aliveProcess, waitMs = 10000, staleMs = 30000 } = {}) {
  const lock = `${file}.lock`
  fs.mkdirSync(dirname(lock), { recursive: true })
  const deadline = Date.now() + waitMs
  for (;;) {
    try {
      const fd = fs.openSync(lock, 'wx')
      fs.writeSync(fd, `${process.pid} ${Date.now()}\n`)
      fs.closeSync(fd)
      break
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      let owner = null
      let at = 0
      try {
        const [pidText, atText] = fs.readFileSync(lock, 'utf8').trim().split(/\s+/)
        owner = Number(pidText)
        at = Number(atText)
      } catch {
        // the holder just released it: try again
      }
      const stale = owner == null || !alive(owner) || Date.now() - at > staleMs
      if (stale) {
        try {
          fs.unlinkSync(lock)
        } catch {
          // someone else took it first
        }
        continue
      }
      if (Date.now() > deadline) throw new Error(`the port registry is locked by pid ${owner}; try again in a moment`)
      sleepMs(100)
    }
  }
  try {
    return fn()
  } finally {
    try {
      fs.unlinkSync(lock)
    } catch {
      // already removed
    }
  }
}
