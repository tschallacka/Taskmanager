// The heavy-job slot with fake process lists and a fake /proc (no real process is looked at for the decisions). Run:
//   node --test crew/heavy-slot.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GRANT_MS, decideSlot, heavyProcesses, isNodeTestFlag, myUid, readGrant, readProcs, releaseGrant, writeGrant } from './heavy-slot.mjs'

const T0 = 1_700_000_000_000
const home = () => mkdtempSync(join(tmpdir(), 'heavy-slot-'))
const ME = myUid()
const proc = (pid, comm, argv, uid = ME) => ({ pid, comm, uid, argv })

test('a chromium or chrome executable is heavy, by its comm', () => {
  assert.deepEqual(heavyProcesses([proc(10, 'chromium', ['chromium', '--headless'])]).map(p => p.name), ['chromium'])
  assert.deepEqual(heavyProcesses([proc(11, 'chrome', ['/opt/chrome/chrome'])]).map(p => p.name), ['chrome'])
})

test('node --test and bun run test or typecheck are heavy; a plain node or bun is not', () => {
  assert.equal(heavyProcesses([proc(20, 'node', ['node', '--test', '--test-force-exit', 'crew/x.test.mjs'])])[0].name, 'node --test')
  assert.equal(heavyProcesses([proc(21, 'bun', ['bun', 'run', 'test'])])[0].name, 'bun run test')
  assert.equal(heavyProcesses([proc(22, 'bun', ['bun', 'run', 'typecheck'])])[0].name, 'bun run typecheck')
  assert.equal(heavyProcesses([proc(23, 'node', ['node', 'server.js'])]).length, 0)
  assert.equal(heavyProcesses([proc(24, 'bun', ['bun', 'run', 'dev'])]).length, 0)
})

test('vue-tsc, run as its script, is heavy', () => {
  assert.equal(heavyProcesses([proc(30, 'node', ['node', '/x/node_modules/vue-tsc/bin/vue-tsc.js', '-b'])])[0].name, 'vue-tsc')
})

test('words in a command line never match: a grep or an editor that names a heavy tool is not heavy', () => {
  const words = [
    proc(40, 'grep', ['grep', '-n', 'node --test', 'notes.txt']),
    proc(41, 'vim', ['vim', 'chromium.md']),
    proc(42, 'bash', ['bash', '-c', 'bun run typecheck > x.log']),
    proc(43, 'node', ['node', 'tools/explain.mjs', 'vue-tsc --help'])
  ]
  assert.equal(heavyProcesses(words).length, 0)
})

test('readProcs reads comm, uid and argv from a /proc-shaped folder, and skips a process that ended', () => {
  const procDir = mkdtempSync(join(tmpdir(), 'fake-proc-'))
  mkdirSync(join(procDir, '501'))
  writeFileSync(join(procDir, '501', 'comm'), 'node\n')
  writeFileSync(join(procDir, '501', 'cmdline'), 'node\0--test\0x.test.mjs\0')
  writeFileSync(join(procDir, '501', 'status'), `Name:\tnode\nUid:\t${ME}\t${ME}\t${ME}\t${ME}\n`)
  mkdirSync(join(procDir, '502'))
  writeFileSync(join(procDir, '502', 'comm'), 'sleep\n') // no cmdline, no status: it ended while read
  mkdirSync(join(procDir, 'self'))
  const rows = readProcs(procDir)
  assert.deepEqual(rows, [{ pid: 501, comm: 'node', uid: ME, argv: ['node', '--test', 'x.test.mjs'] }])
  assert.equal(heavyProcesses(rows)[0].name, 'node --test')
})

test('only the crew user\'s processes count: a chromium or a test run of another user does not hold the slot', () => {
  const other = ME + 1
  assert.equal(heavyProcesses([proc(90, 'chromium', ['chromium'], other)]).length, 0)
  assert.equal(heavyProcesses([proc(91, 'node', ['node', '--test'], other)]).length, 0)
  const h = home()
  const out = decideSlot({ home: h, asker: 'wade', procs: [proc(92, 'chromium', ['chromium'], other)], now: T0 })
  assert.equal(out.granted, true, 'the Owner\'s browser does not block the crew')
  assert.equal(heavyProcesses([proc(93, 'chromium', ['chromium'])]).length, 1, 'our own still counts')
})

test('the --test flag counts only before the script: node --test, and node --import tsx --test file; not a --test after the script', () => {
  assert.equal(isNodeTestFlag(['node', '--test']), true)
  assert.equal(isNodeTestFlag(['node', '--env-file-if-exists=.env', '--import', 'tsx', '--test', 'tests/x.test.ts']), true)
  assert.equal(isNodeTestFlag(['node', 'tools/explain.mjs', '--test']), false)
  assert.equal(isNodeTestFlag(['node', 'server.js']), false)
  assert.equal(heavyProcesses([proc(100, 'node', ['node', 'tools/runner.mjs', '--test'])]).length, 0)
  assert.equal(heavyProcesses([proc(101, 'node', ['node', '--import', 'tsx', '--test', 'tests/x.test.ts'])])[0].name, 'node --test')
})

test('no heavy process and no grant: the ask is granted, the grant file is mode 600 and names the asker', () => {
  const h = home()
  const out = decideSlot({ home: h, asker: 'wick', purpose: 'typecheck', procs: [], now: T0 })
  assert.equal(out.granted, true)
  assert.equal(out.mail, 'slot granted')
  assert.equal(statSync(join(h, 'heavy-slot.json')).mode & 0o777, 0o600)
  assert.deepEqual(JSON.parse(readFileSync(join(h, 'heavy-slot.json'), 'utf8')), { holder: 'wick', purpose: 'typecheck', since: T0 })
})

test('a live grant to someone else makes the ask busy, and names the holder', () => {
  const h = home()
  writeGrant(h, { holder: 'wick', purpose: 'test', since: T0 })
  const out = decideSlot({ home: h, asker: 'wade', procs: [], now: T0 + 1000 })
  assert.equal(out.granted, false)
  assert.equal(out.mail, 'slot busy: wick')
})

test('a running heavy process makes the ask busy, even with no grant', () => {
  const h = home()
  const out = decideSlot({ home: h, asker: 'wade', procs: [proc(77, 'chromium', ['chromium'])], now: T0 })
  assert.equal(out.granted, false)
  assert.equal(out.mail, 'slot busy: process chromium (pid 77)')
  assert.equal(existsSync(join(h, 'heavy-slot.json')), false, 'nothing is granted, so no file is written')
})

test('a grant expires 60 minutes after since: it no longer counts, and the log says grant expired', () => {
  const h = home()
  writeGrant(h, { holder: 'wick', purpose: 'test', since: T0 })
  assert.equal(readGrant(h, T0 + GRANT_MS - 1).expired, false, 'still counts just before 60 minutes')
  const out = decideSlot({ home: h, asker: 'wade', procs: [], now: T0 + GRANT_MS })
  assert.equal(out.granted, true, 'an expired grant no longer blocks')
  assert.equal(out.mail, 'slot granted')
  assert.ok(out.log.some(line => /^grant expired: wick/.test(line)), out.log.join(' | '))
})

test('a process ending frees the slot: no heavy process left means a grant', () => {
  const h = home()
  assert.equal(decideSlot({ home: h, asker: 'wade', procs: [proc(80, 'chromium', ['chromium'])], now: T0 }).granted, false)
  assert.equal(decideSlot({ home: h, asker: 'wade', procs: [], now: T0 + 5000 }).granted, true)
})

test('only the holder can release the grant; the release frees the slot for the next ask', () => {
  const h = home()
  writeGrant(h, { holder: 'wick', purpose: 'test', since: T0 })
  assert.equal(releaseGrant(h, 'wade'), false, 'someone else cannot release it')
  assert.equal(releaseGrant(h, 'wick'), true)
  assert.equal(decideSlot({ home: h, asker: 'wade', procs: [], now: T0 + 1 }).granted, true)
})

test('the decision never starts or stops a process: it only writes the grant file', () => {
  const h = home()
  const before = listFiles(h)
  decideSlot({ home: h, asker: 'wade', procs: [], now: T0 })
  assert.deepEqual(listFiles(h), before.concat('heavy-slot.json'), 'the only new file is the grant')
})

function listFiles(dir) {
  return existsSync(dir) ? readdirSync(dir) : []
}
