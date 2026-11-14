#!/usr/bin/env node
// `crew <who> lab submit <branch> [--file tests/x.test.ts] [--repeat n]`, `crew <who> lab status`, `crew <who> lab cancel
// <branch>` (card mwdkxbr0thtrcnc7mbi, slice 1). Submit writes a request file that the runner (crew/lab-runner.mjs) reads
// and queues; it does not run anything itself. Status and cancel read and write the queue under its lock. The MCP tools
// come in a later slice.
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { crewHome } from './home.mjs'
import { cancel, queueFile, readQueue, requestDir, statusLines, validSample, withQueue } from './lab-queue.mjs'

/** Splits `submit <branch> [--file f] [--repeat n]` into its parts. Unknown flags are an error. */
export function parseSubmit(args) {
  const out = { branch: null, file: null, repeat: null }
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]
    if (a === '--file') { out.file = args[i + 1] ?? ''; i += 1 }
    else if (a === '--repeat') { out.repeat = args[i + 1] ?? ''; i += 1 }
    else if (a.startsWith('--')) return { error: `unknown flag ${a}` }
    else if (out.branch === null) out.branch = a
    else return { error: `one branch only; got ${a}` }
  }
  if (!out.branch) return { error: 'usage: crew <who> lab submit <branch> [--file tests/x.test.ts] [--repeat n]' }
  return out
}

/** Writes one request file (atomically: a .tmp name, then a rename) for the runner to read. Returns the sample id. */
export function writeRequest(home, sample, { who, now = new Date() }) {
  const id = `lab-${now.getTime().toString(36)}-${randomBytes(3).toString('hex')}`
  const dir = requestDir(home)
  fs.mkdirSync(dir, { recursive: true })
  const file = join(dir, `${id}.json`)
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify({ id, ...sample, by: who, at: now.toISOString() }, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(`${file}.tmp`, file)
  return id
}

export function main(argv, home = crewHome(), now = new Date()) {
  const [who, cmd, ...args] = argv
  if (!who || !cmd) return { code: 64, lines: ['usage: crew <who> lab submit|status|cancel ...'] }
  if (cmd === 'submit') {
    const parsed = parseSubmit(args)
    if (parsed.error) return { code: 64, lines: [parsed.error] }
    const checked = validSample({ branch: parsed.branch, file: parsed.file, repeat: parsed.repeat ?? 1 })
    if (!checked.ok) return { code: 65, lines: [`refused: ${checked.message}`] }
    const id = writeRequest(home, checked.sample, { who, now })
    return { code: 0, lines: [`request ${id} written for ${checked.sample.branch}; the lab runner queues it`] }
  }
  if (cmd === 'status') {
    return { code: 0, lines: statusLines(readQueue(queueFile(home))) }
  }
  if (cmd === 'cancel') {
    const branch = args[0]
    if (!branch) return { code: 64, lines: ['usage: crew <who> lab cancel <branch>'] }
    const out = withQueue(home, queue => {
      const r = cancel(queue, branch)
      return r.ok ? { result: r, queue: r.queue } : { result: r }
    })
    return out.ok ? { code: 0, lines: [`cancelled ${out.id} (${branch})`] } : { code: 1, lines: [out.message] }
  }
  return { code: 64, lines: [`unknown lab command ${cmd}`] }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = main(process.argv.slice(2))
  for (const line of out.lines) console.log(line)
  process.exit(out.code)
}
