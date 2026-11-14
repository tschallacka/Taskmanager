// The stale-copies report (crew/stale-copies.mjs) and the read-only ports of the port registry, tested with fake pids,
// fake ports and a fake clock. No process is started and no port is opened.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyTasks, doneIdsOf, MAX_AGE_MS, staleCopies, staleLines } from './stale-copies.mjs'
import { planRelease, planReserve, pruned, readOnlyEntries, readOnlyLines, readRegistry } from './port-registry.mjs'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const NOW = Date.parse('2026-11-14T12:00:00.000Z')
const HOURS = 60 * 60 * 1000
const alive = pid => pid !== 999 // pid 999 is a copy whose process is gone
const copy = (over = {}) => ({ worktree: '/work/taskmanager-wren', branch: 'wren/mwdx-task', task: 'mwdx', who: 'wren', pid: 4242, started: new Date(NOW - HOURS).toISOString(), ...over })

test('a copy older than 4 hours is reported; a younger one is not', () => {
  const reg = { ports: { 3101: copy({ started: new Date(NOW - 5 * HOURS).toISOString() }), 3102: copy({ pid: 4243, task: 'mwy', started: new Date(NOW - 2 * HOURS).toISOString() }) } }
  const out = staleCopies(reg, { now: NOW, alive, doneIds: new Set() })
  assert.deepEqual(out.map(c => c.port), [3101])
  assert.match(out[0].reason, /older than 4 hours \(5 h\)/)
})

test('a copy exactly at 4 hours is not yet reported; past it is', () => {
  const at = { ports: { 3101: copy({ started: new Date(NOW - MAX_AGE_MS).toISOString() }) } }
  assert.equal(staleCopies(at, { now: NOW, alive, doneIds: new Set() }).length, 0)
  const past = { ports: { 3101: copy({ started: new Date(NOW - MAX_AGE_MS - 1).toISOString() }) } }
  assert.equal(staleCopies(past, { now: NOW, alive, doneIds: new Set() }).length, 1)
})

test('a copy of a card that is Done is reported, however young', () => {
  const reg = { ports: { 3101: copy({ task: 'mwdone', started: new Date(NOW - 10 * 60 * 1000).toISOString() }) } }
  const out = staleCopies(reg, { now: NOW, alive, doneIds: new Set(['mwdone']) })
  assert.equal(out.length, 1)
  assert.equal(out[0].reason, 'its card is Done')
})

test('a copy both old and Done gives both reasons', () => {
  const reg = { ports: { 3101: copy({ task: 'mwdone', started: new Date(NOW - 6 * HOURS).toISOString() }) } }
  assert.match(staleCopies(reg, { now: NOW, alive, doneIds: new Set(['mwdone']) })[0].reason, /older than 4 hours .* and its card is Done/)
})

test('a copy whose process is gone, a reservation (pid null), and a read-only entry are never reported', () => {
  const reg = {
    ports: {
      3101: copy({ pid: 999, started: new Date(NOW - 9 * HOURS).toISOString() }),
      3102: copy({ pid: null, started: new Date(NOW - 9 * HOURS).toISOString() }),
      3000: { ...copy({ started: new Date(NOW - 9 * HOURS).toISOString() }), readonly: true, label: "Boss's dev copy" }
    }
  }
  assert.deepEqual(staleCopies(reg, { now: NOW, alive, doneIds: new Set() }), [])
})

test('the lines name the port, the person, the worktree, the card and the reason, and say the report is read only', () => {
  const lines = staleLines([{ port: 3101, who: 'wren', worktree: '/work/wren', task: 'mwdx', pid: 4242, reason: 'its card is Done' }])
  assert.equal(lines[0], ':3101 wren /work/wren card mwdx (pid 4242): its card is Done')
  assert.match(lines[1], /read only: Janet stops a copy only with a go from Boss/)
  assert.deepEqual(staleLines([]), ['stale dev copies: none'])
})

test('the cards checked are the live copies cards: a reservation, a read-only entry and a dead copy add none', () => {
  const reg = {
    ports: {
      3101: copy({ task: 'mwa' }),
      3102: copy({ task: 'mwb', pid: 999 }),
      3103: copy({ task: 'mwc', pid: null }),
      3000: { ...copy({ task: 'mwd' }), readonly: true, label: "Boss's dev copy" },
      3104: copy({ task: 'mwa', pid: 4300 })
    }
  }
  assert.deepEqual(copyTasks(reg, alive).sort(), ['mwa'], 'one card for both live copies of mwa, none for the others')
})

test('a card is Done when its own answer says so, however many cards the Done column holds', () => {
  const answers = [{ id: 'mwa', column: 'Done' }, { id: 'mwb', column: 'Verify UX' }, { id: 'mwc', column: 'done' }]
  assert.deepEqual([...doneIdsOf(answers)].sort(), ['mwa', 'mwc'])
  assert.equal(doneIdsOf([{ id: 'mwx', column: 'Done (cut)' }]).has('mwx'), false, 'only the Done column counts')
})

test('a copy whose card is Done is reported when the card answer says Done; the Done list is not read at all', () => {
  const reg = { ports: { 3101: copy({ task: 'mwdone', started: new Date(NOW - 10 * 60 * 1000).toISOString() }) } }
  assert.equal(staleCopies(reg, { now: NOW, alive, doneIds: doneIdsOf([{ id: 'mwdone', column: 'Done' }]) })[0].reason, 'its card is Done')
  assert.equal(staleCopies(reg, { now: NOW, alive, doneIds: doneIdsOf([{ id: 'mwdone', column: 'Verify QA' }]) }).length, 0)
})

test('read-only entries are always in the registry, and no planning step can take, stop or free them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ro-'))
  const file = join(dir, 'ports.json')
  writeFileSync(file, JSON.stringify({ ports: { 3000: { worktree: '/work/mine', who: 'wren', pid: 1, started: null } } }))
  const reg = readRegistry(file)
  assert.equal(reg.ports[3000].readonly, true, 'the stored entry for 3000 is replaced by the read-only one')
  assert.equal(reg.ports[3105].label, "quincy's tester copy")
  const reserve = planReserve({ reg, port: 3000, who: 'wren', worktree: '/work/x', branch: 'b', task: 't', pid: 5, alive, replace: true })
  assert.equal(reserve.ok, false)
  assert.match(reserve.message, /read-only: Boss's dev copy\. Nobody can take it\./)
  const release = planRelease({ reg, port: 3108, worktree: '/work/x' })
  assert.equal(release.ok, false)
  assert.match(release.message, /nothing is stopped/)
  // Pruning keeps them even though their pid is null and the alive test would say nothing about them.
  assert.ok(pruned(reg, () => false).reg.ports[3105])
  assert.equal(Object.keys(readOnlyEntries()).length, 5)
  assert.deepEqual(readOnlyLines()[0], 'read-only :3000 Boss\'s dev copy: nobody can take it')
})
