// The port registry: a worktree reserves its port, another worktree is refused with the holder named, the same worktree
// may take it again, a release frees it only for its holder, and a free port is found for a person in their range.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { freePortFor, portsFor, readRegistry, releasePort, reservePort } from './port-registry.mjs'

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'ports-'))
  return { dir, path: join(dir, '.listen', 'ports.json'), done: () => rmSync(dir, { recursive: true, force: true }) }
}

test('a worktree reserves its port and the registry records who, worktree, branch, card and pid', () => {
  const s = scratch()
  try {
    const held = reservePort(s.path, { port: 3101, who: 'wren', worktree: '/w/wren-a', branch: 'wren/a', task: 'mwa', pid: 42 })
    assert.equal(held.who, 'wren')
    const onDisk = JSON.parse(readFileSync(s.path, 'utf8'))
    assert.equal(onDisk['3101'].worktree, '/w/wren-a')
    assert.equal(onDisk['3101'].pid, 42)
  } finally {
    s.done()
  }
})

test('another worktree is refused the port, and the message names the worktree and the card that hold it', () => {
  const s = scratch()
  try {
    reservePort(s.path, { port: 3101, who: 'wren', worktree: '/w/wren-a', branch: 'wren/a', task: 'mwa' })
    assert.throws(
      () => reservePort(s.path, { port: 3101, who: 'wren', worktree: '/w/wren-b', branch: 'wren/b', task: 'mwb' }),
      /port 3101 is held by \/w\/wren-a \(branch wren\/a, card mwa, wren\)/
    )
  } finally {
    s.done()
  }
})

test('the same worktree may take its port again, and a release frees it only for its holder', () => {
  const s = scratch()
  try {
    reservePort(s.path, { port: 3101, who: 'wren', worktree: '/w/wren-a', branch: 'wren/a', task: 'mwa' })
    assert.doesNotThrow(() => reservePort(s.path, { port: 3101, who: 'wren', worktree: '/w/wren-a', branch: 'wren/a', task: 'mwa' }))
    assert.deepEqual(releasePort(s.path, { port: 3101, worktree: '/w/wren-b' }), { released: false, reason: 'the port is held by /w/wren-a, not this worktree' })
    assert.deepEqual(releasePort(s.path, { port: 3101, worktree: '/w/wren-a' }), { released: true })
    assert.deepEqual(readRegistry(s.path), {})
    assert.deepEqual(releasePort(s.path, { port: 3101, worktree: '/w/wren-a' }), { released: false, reason: 'the port is free' })
  } finally {
    s.done()
  }
})

test('ports come from crew.json, with the default by person, and extra ports after the own one', () => {
  assert.deepEqual(portsFor('wren', {}), [3101])
  assert.deepEqual(portsFor('wade', {}), [3104])
  assert.deepEqual(portsFor('wren', { ports: { workers: { wren: 3201 }, extra: { wren: [3202] } } }), [3201, 3202])
  assert.deepEqual(portsFor('nobody', {}), [])
})

test('a free port is found in the person range, skipping ones held by other worktrees, and a worktree sees its own', () => {
  const s = scratch()
  try {
    const config = { ports: { extra: { wren: [3102] } } }
    reservePort(s.path, { port: 3101, who: 'wren', worktree: '/w/wren-a', branch: 'wren/a', task: 'mwa' })
    assert.equal(freePortFor(s.path, 'wren', config, '/w/wren-b'), 3102, 'the held port is skipped')
    assert.equal(freePortFor(s.path, 'wren', config, '/w/wren-a'), 3101, 'a worktree sees its own port as free to use')
    reservePort(s.path, { port: 3102, who: 'wren', worktree: '/w/wren-c', branch: 'wren/c', task: 'mwc' })
    assert.equal(freePortFor(s.path, 'wren', config, '/w/wren-b'), null, 'every port held: no free port')
  } finally {
    s.done()
  }
})
