// Tests for the port registry: planning with fake pids and ports, the lock file, and the listener parse. No process is
// started and no port is opened.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  held, listenerPidOnPort, planRelease, planReserve, portOf, pruned, servedCheck, taskOfBranch, withDevDefaults, withLock
} from './port-registry.mjs'

const WREN = '/work/taskmanager-wren-mwdlkxb5'
const WICK = '/work/taskmanager-wick-mwdbj928'
const alive = pid => [100, 200].includes(pid)

test('a free port is reserved for the worktree, with no copy running yet (pid null)', () => {
  const plan = planReserve({ reg: { ports: {} }, port: 3101, who: 'wren', worktree: WREN, branch: 'wren/x', task: 'mwdlkxb56xr2ek89g92', alive })
  assert.equal(plan.ok, true)
  assert.equal(plan.same, false)
  assert.equal(plan.next.ports[3101].worktree, WREN)
  assert.equal(plan.next.ports[3101].pid, null)
  assert.equal(plan.next.ports[3101].task, 'mwdlkxb56xr2ek89g92')
})

test('a port held by another worktree that runs is refused, and the message names the holder', () => {
  const reg = { ports: { 3101: { worktree: WICK, branch: 'wick/y', task: 'mwdbj928', who: 'wick', pid: 100 } } }
  const plan = planReserve({ reg, port: 3101, who: 'wren', worktree: WREN, alive })
  assert.equal(plan.ok, false)
  assert.match(plan.message, /held by wick's worktree/)
  assert.match(plan.message, /mwdbj928/)
  assert.match(plan.message, /crew wick serve --stop/)
})

test('--replace never stops another person\'s copy', () => {
  const reg = { ports: { 3101: { worktree: WICK, branch: 'wick/y', task: 'mwdbj928', who: 'wick', pid: 100 } } }
  const plan = planReserve({ reg, port: 3101, who: 'wren', worktree: WREN, alive, replace: true })
  assert.equal(plan.ok, false)
})

test('--replace stops only the same person\'s own old copy, and names its pid', () => {
  const reg = { ports: { 3101: { worktree: '/work/old-wren', branch: 'wren/old', task: null, who: 'wren', pid: 100 } } }
  const plan = planReserve({ reg, port: 3101, who: 'wren', worktree: WREN, alive, replace: true })
  assert.equal(plan.ok, true)
  assert.equal(plan.stop, 100)
  assert.equal(plan.next.ports[3101].worktree, WREN)
})

test('the same worktree asking again keeps its entry and is not refused', () => {
  const reg = { ports: { 3101: { worktree: WREN, branch: 'wren/x', task: null, who: 'wren', pid: 100 } } }
  const plan = planReserve({ reg, port: 3101, who: 'wren', worktree: WREN, alive })
  assert.equal(plan.ok, true)
  assert.equal(plan.same, true)
  assert.equal(plan.next.ports[3101].pid, 100)
})

test('a reservation (pid null) holds its port: another worktree is refused while it stands', () => {
  const reg = { ports: { 3101: { worktree: WICK, branch: 'wick/y', task: null, who: 'wick', pid: null } } }
  assert.equal(held(reg.ports[3101], alive), true)
  assert.equal(planReserve({ reg, port: 3101, who: 'wren', worktree: WREN, alive }).ok, false)
})

test('stale entries are dropped when their pid is gone; reservations stay', () => {
  const reg = {
    ports: {
      3101: { worktree: WREN, pid: 999 },
      3102: { worktree: WICK, pid: 100 },
      3103: { worktree: '/work/r', pid: null }
    }
  }
  const { reg: next, dropped } = pruned(reg, alive)
  assert.deepEqual(dropped, [3101])
  assert.deepEqual(Object.keys(next.ports).sort(), ['3102', '3103'])
})

test('a release frees the port only for its holder, and stops its copy', () => {
  const reg = { ports: { 3101: { worktree: WREN, pid: 100 } } }
  const refused = planRelease({ reg, port: 3101, worktree: WICK })
  assert.equal(refused.ok, false)
  assert.equal(reg.ports[3101].worktree, WREN)
  const freed = planRelease({ reg, port: 3101, worktree: WREN })
  assert.equal(freed.ok, true)
  assert.equal(freed.stop, 100)
  assert.equal(freed.next.ports[3101], undefined)
})

test('releasing a port nobody holds is a no-op', () => {
  const plan = planRelease({ reg: { ports: {} }, port: 3101, worktree: WREN })
  assert.equal(plan.ok, true)
  assert.equal(plan.noop, true)
})

test('portOf reads devServers for the person; a missing or bad port is null', () => {
  assert.equal(portOf({ devServers: { wren: 3101 } }, 'wren'), 3101)
  assert.equal(portOf({ devServers: { wren: 'x' } }, 'wren'), null)
  assert.equal(portOf({}, 'wren'), null)
})

test('the listener is found with lsof, and with the /proc tables when lsof is not installed; nothing listening is null', () => {
  // lsof present: its first pid is the listener; exit 1 with no output means nothing listens.
  assert.equal(listenerPidOnPort(3101, { run: () => ({ status: 0, stdout: '4242\n' }) }), 4242)
  assert.equal(listenerPidOnPort(3101, { run: () => ({ status: 1, stdout: '' }) }), null)
  // lsof missing: the port 3101 row (0x0C1D, state 0A) gives inode 98765; the process holding socket:[98765] is 5151.
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'ports-proc-'))
  fs.mkdirSync(join(dir, 'net'))
  fs.writeFileSync(join(dir, 'net', 'tcp'), '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n   0: 0100007F:0C1D 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 98765 1 0000 100 0 0\n')
  fs.writeFileSync(join(dir, 'net', 'tcp6'), '')
  fs.mkdirSync(join(dir, '5151', 'fd'), { recursive: true })
  fs.symlinkSync('socket:[98765]', join(dir, '5151', 'fd', '3'))
  fs.mkdirSync(join(dir, '6000', 'fd'), { recursive: true })
  fs.symlinkSync('socket:[11111]', join(dir, '6000', 'fd', '3'))
  const missing = () => ({ error: Object.assign(new Error('spawnSync lsof ENOENT'), { code: 'ENOENT' }) })
  assert.equal(listenerPidOnPort(3101, { run: missing, procRoot: dir }), 5151)
  assert.equal(listenerPidOnPort(3102, { run: missing, procRoot: dir }), null, 'no row for that port')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('crew.json gets the missing dev ports and the start command, and nothing that is already set is changed', () => {
  const first = withDevDefaults({ people: { wren: 'Wren', pia: 'Pia' }, devServers: { wren: 3999 } })
  assert.equal(first.changed, true)
  assert.equal(first.config.devServers.wren, 3999, 'an existing port is kept')
  assert.equal(first.config.devServers.pia, undefined, 'a person with no default port gets none; Boss adds it')
  assert.match(first.config.scripts.serve, /--port \{port\}/)
  const second = withDevDefaults(first.config)
  assert.equal(second.changed, false, 'a second run writes nothing')
})

test('--check serves the commit recorded at start: the same HEAD passes; a moved HEAD or an old entry stops', () => {
  assert.deepEqual(servedCheck({ commit: 'abc1234', pid: 9 }, 'abc1234'), { ok: true, commit: 'abc1234' })
  const moved = servedCheck({ commit: 'abc1234', pid: 9 }, 'def5678')
  assert.equal(moved.ok, false)
  assert.match(moved.message, /serves abc1234, but the worktree is at def5678/)
  const old = servedCheck({ pid: 9 }, 'def5678')
  assert.equal(old.ok, false)
  assert.match(old.message, /started before its commit was recorded/)
  assert.equal(servedCheck(undefined, 'def5678').ok, false, 'no entry is not served')
})

test('the task id is read from a branch name', () => {
  assert.equal(taskOfBranch('wren/mwdlkxb56xr2ek89g92-prepare-worktree'), 'mwdlkxb56xr2ek89g92')
  assert.equal(taskOfBranch('main'), null)
})

test('the lock is taken over when its owner is gone, and released after the work', () => {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'ports-lock-'))
  const file = join(dir, 'ports.json')
  fs.writeFileSync(`${file}.lock`, `999999 ${Date.now()}\n`)
  let ran = false
  withLock(file, () => {
    ran = true
    assert.equal(fs.existsSync(`${file}.lock`), true)
  }, { alive: () => false })
  assert.equal(ran, true)
  assert.equal(fs.existsSync(`${file}.lock`), false)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('a lock held by a live owner is not taken: the caller gives up after its wait', () => {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'ports-lock-'))
  const file = join(dir, 'ports.json')
  fs.writeFileSync(`${file}.lock`, `4242 ${Date.now()}\n`)
  assert.throws(() => withLock(file, () => {}, { alive: () => true, waitMs: 150 }), /locked by pid 4242/)
  assert.equal(fs.existsSync(`${file}.lock`), true)
  fs.rmSync(dir, { recursive: true, force: true })
})
