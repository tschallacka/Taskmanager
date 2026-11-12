// The port registry of the dev copies: which port each worktree holds, so two copies never fight for one port. It is one
// JSON file in the crew home (.listen/ports.json): port -> { who, worktree, branch, task, pid, started }. A writer takes a
// lock file first, so two commands at once cannot both take a port. The ports come from crew.json: `ports.workers` maps a
// person to a port (default: wren 3101, wick 3102, wynn 3103, wade 3104, as bin/devserver-worker.sh has them), and
// `ports.extra` maps a person to more ports for a second copy.

import { mkdirSync, openSync, closeSync, readFileSync, renameSync, unlinkSync, writeFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

export const DEFAULT_PORTS = { wren: 3101, wick: 3102, wynn: 3103, wade: 3104 }

/** The ports a person may hold: their own port first, then any extra ones from crew.json. */
export function portsFor(who, config) {
  const own = config?.ports?.workers?.[who] ?? DEFAULT_PORTS[who]
  const extra = Array.isArray(config?.ports?.extra?.[who]) ? config.ports.extra[who] : []
  return [own, ...extra].filter(port => Number.isInteger(port))
}

/** The registry as it is on disk; a missing or unreadable file is an empty registry (it is rewritten on the next write). */
export function readRegistry(path) {
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** Runs `work` with the registry lock held; the lock is a file created exclusively and removed afterwards. */
export function withLock(path, work, { retries = 50, waitMs = 100 } = {}) {
  mkdirSync(dirname(path), { recursive: true })
  const lock = `${path}.lock`
  for (let attempt = 0; ; attempt++) {
    try {
      closeSync(openSync(lock, 'wx'))
      break
    } catch (error) {
      if (error.code !== 'EEXIST' || attempt >= retries) throw new Error(`the port registry is locked (${lock}); try again`)
      const until = Date.now() + waitMs
      while (Date.now() < until) { /* short wait for the other writer */ }
    }
  }
  try {
    return work()
  } finally {
    try { unlinkSync(lock) } catch { /* already gone */ }
  }
}

function writeRegistry(path, registry) {
  const temp = `${path}.tmp`
  writeFileSync(temp, `${JSON.stringify(registry, null, 2)}\n`)
  renameSync(temp, path)
}

/**
 * Reserves `port` for a worktree. The same person and worktree may take it again (it is theirs). Another worktree that
 * holds it refuses, and the message says which worktree and card hold it.
 */
export function reservePort(path, { port, who, worktree, branch, task, pid = null, started = Date.now() }) {
  return withLock(path, () => {
    const registry = readRegistry(path)
    const holder = registry[String(port)]
    if (holder && holder.worktree !== worktree) {
      throw new Error(`port ${port} is held by ${holder.worktree} (branch ${holder.branch}, card ${holder.task}, ${holder.who}); pick another port or release it`)
    }
    registry[String(port)] = { who, worktree, branch, task, pid, started }
    writeRegistry(path, registry)
    return registry[String(port)]
  })
}

/** Frees the port a worktree holds. Another worktree's port is left alone; the function says so. */
export function releasePort(path, { port, worktree }) {
  return withLock(path, () => {
    const registry = readRegistry(path)
    const holder = registry[String(port)]
    if (!holder) return { released: false, reason: 'the port is free' }
    if (holder.worktree !== worktree) return { released: false, reason: `the port is held by ${holder.worktree}, not this worktree` }
    delete registry[String(port)]
    writeRegistry(path, registry)
    return { released: true }
  })
}

/** The first port a person may hold that is not held by another worktree, or null when every one is taken. */
export function freePortFor(path, who, config, worktree) {
  const registry = readRegistry(path)
  for (const port of portsFor(who, config)) {
    const holder = registry[String(port)]
    if (!holder || holder.worktree === worktree) return port
  }
  return null
}
