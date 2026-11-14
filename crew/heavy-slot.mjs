// The heavy-job slot (card mwf201blsqvx3jczev, phase 1). The crew has one slot for heavy work: a test run, a typecheck, a
// browser run. A person asks for it; the daemon grants it when no heavy process of the crew is running and no live grant
// names someone else, and it tells the asker. The daemon only grants and tells. It never starts or stops a process.
//
// A process counts as heavy by its executable, not by words in its command line:
//   - chromium or chrome (the executable named by /proc/<pid>/comm);
//   - node with the flag `--test` before its script (node --test, node --import tsx --test tests/x.ts), `run test` or
//     `run typecheck` (bun run ...), or `test` (bun test). A `--test` after the script belongs to the script;
//   - vue-tsc, run as its script (node .../vue-tsc.js).
// Only the crew user's processes count: the scan keeps a process whose real uid is the user the daemon runs as. Heavy
// work by the Owner or another user on the same server does not hold the crew's slot.
// A grant lives in CREW_HOME/heavy-slot.json (mode 600) and expires 60 minutes after its `since`. An expired grant no longer
// counts, and the daemon logs "grant expired" for it.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

export const GRANT_MINUTES = 60
export const GRANT_MS = GRANT_MINUTES * 60 * 1000
const HEAVY_COMMS = new Set(['chromium', 'chrome'])

/** The user the daemon runs as: only processes with this real uid count. */
export function myUid() {
  return typeof process.getuid === 'function' ? process.getuid() : null
}

// Node options that take a separate value: the value is not a script or a flag.
const NODE_VALUE_OPTIONS = new Set(['--import', '--require', '-r', '--loader', '--env-file', '--conditions', '-C'])

/**
 * Whether `--test` is a flag of node itself: it comes before the script (the first argument that is a file). Node's
 * options may come first: `node --test`, `node --import tsx --test tests/x.ts`. `node tool.mjs --test` is not node's flag.
 */
export function isNodeTestFlag(argv) {
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--test') return true
    if (NODE_VALUE_OPTIONS.has(arg)) {
      i += 1
      continue
    }
    if (arg.startsWith('-')) continue
    return false // the script: from here on, the arguments are its own
  }
  return false
}

/**
 * The heavy processes among a list of { pid, comm, uid, argv }, counting only the processes of `uid` (default: this
 * user). Words elsewhere in a command line never match.
 */
export function heavyProcesses(procs, uid = myUid()) {
  const out = []
  for (const proc of procs) {
    if (uid == null || proc?.uid !== uid) continue
    const comm = String(proc?.comm ?? '')
    const argv = Array.isArray(proc?.argv) ? proc.argv.map(String) : []
    const exe = basename(argv[0] ?? '')
    const script = basename(argv[1] ?? '')
    if (HEAVY_COMMS.has(comm)) {
      out.push({ pid: proc.pid, name: comm })
    } else if ((exe === 'node' || comm === 'node') && isNodeTestFlag(argv)) {
      out.push({ pid: proc.pid, name: 'node --test' })
    } else if ((exe === 'bun' || comm === 'bun') && argv[1] === 'run' && ['test', 'typecheck'].includes(argv[2])) {
      out.push({ pid: proc.pid, name: `bun run ${argv[2]}` })
    } else if ((exe === 'bun' || comm === 'bun') && argv[1] === 'test') {
      out.push({ pid: proc.pid, name: 'bun test' })
    } else if (script === 'vue-tsc' || script === 'vue-tsc.js') {
      out.push({ pid: proc.pid, name: 'vue-tsc' })
    }
  }
  return out
}

/** Reads /proc into { pid, comm, uid, argv } rows (uid: the real uid, from status). A process that ends while it is read is left out. */
export function readProcs(procDir = '/proc') {
  const out = []
  for (const pid of readdirSync(procDir).filter(p => /^\d+$/.test(p))) {
    try {
      const comm = readFileSync(join(procDir, pid, 'comm'), 'utf8').trim()
      const argv = readFileSync(join(procDir, pid, 'cmdline'), 'utf8').split('\0').filter(Boolean)
      const uid = Number(/^Uid:\s+(\d+)/m.exec(readFileSync(join(procDir, pid, 'status'), 'utf8'))?.[1])
      if (!Number.isInteger(uid)) continue
      out.push({ pid: Number(pid), comm, uid, argv })
    } catch {
      // Ended while being read.
    }
  }
  return out
}

function grantFile(home) {
  return join(home, 'heavy-slot.json')
}

/**
 * The grant as it stands at `now`: { grant } while it counts, { grant, expired: true } once 60 minutes have passed since its
 * `since`, or null when there is no grant. Pure apart from the read.
 */
export function readGrant(home, now = Date.now()) {
  const file = grantFile(home)
  if (!existsSync(file)) return null
  let grant
  try {
    grant = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
  if (!grant || typeof grant.holder !== 'string' || typeof grant.since !== 'number') return null
  if (now - grant.since >= GRANT_MS) return { grant, expired: true }
  return { grant, expired: false }
}

/** Writes the grant file (mode 600). Only the decision function calls this. */
export function writeGrant(home, grant) {
  mkdirSync(home, { recursive: true })
  writeFileSync(grantFile(home), `${JSON.stringify(grant, null, 2)}\n`, { mode: 0o600 })
}

/** Removes the grant when its holder releases it. Refused, with false, for anyone else. */
export function releaseGrant(home, asker) {
  const found = readGrant(home)
  if (!found || found.grant.holder !== asker) return false
  rmSync(grantFile(home), { force: true })
  return true
}

/**
 * The decision for one ask: grant, or say who holds it. Pure apart from the grant write on a grant.
 * Returns { granted, holder?, mail, log[] }. The mail is the text to send the asker. Nothing else is started or stopped.
 */
export function decideSlot({ home, asker, purpose = '', procs = [], now = Date.now(), uid = myUid() }) {
  const log = []
  const found = readGrant(home, now)
  if (found?.expired) log.push(`grant expired: ${found.grant.holder} (since ${new Date(found.grant.since).toISOString()})`)
  if (found && !found.expired && found.grant.holder !== asker) {
    return { granted: false, holder: found.grant.holder, mail: `slot busy: ${found.grant.holder}`, log }
  }
  if (found && !found.expired && found.grant.holder === asker) {
    return { granted: true, holder: asker, mail: 'slot granted', log }
  }
  const busy = heavyProcesses(procs, uid)
  if (busy.length) {
    const holder = `process ${busy[0].name} (pid ${busy[0].pid})`
    return { granted: false, holder, mail: `slot busy: ${holder}`, log }
  }
  writeGrant(home, { holder: asker, purpose: String(purpose).slice(0, 200), since: now })
  return { granted: true, holder: asker, mail: 'slot granted', log }
}
