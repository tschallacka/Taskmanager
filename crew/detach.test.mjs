// crew/detach.sh: a command kept in a detached tmux session on a private socket. It uses a real tmux on a
// socket in a throwaway folder, and kills that socket's server when done; with no tmux on the machine, the
// tests skip and say why. Run:
//   node --test crew/detach.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, 'detach.sh')
const tmux = spawnSync('tmux', ['-V'], { encoding: 'utf8' })
const SKIP = tmux.status === 0 ? false : 'tmux is not installed on this machine'

function detach(args) {
  return spawnSync('sh', [SCRIPT, ...args], { encoding: 'utf8', timeout: 30000 })
}

test('start keeps a command in a detached session; check sees it; a second start does nothing', { skip: SKIP }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'detach-test-'))
  const sock = join(dir, 'tmux.sock')
  try {
    assert.equal(detach(['check', sock, 'probe']).status, 1, 'no session yet')
    const first = detach(['start', sock, 'probe', 'sleep 60'])
    assert.equal(first.status, 0, first.stderr)
    assert.equal(first.stdout.trim(), 'started')
    assert.equal(detach(['check', sock, 'probe']).status, 0, 'the session exists')
    const second = detach(['start', sock, 'probe', 'sleep 60'])
    assert.equal(second.status, 0)
    assert.equal(second.stdout.trim(), 'already running')
  } finally {
    spawnSync('tmux', ['-S', sock, 'kill-server'], { encoding: 'utf8' })
    rmSync(dir, { recursive: true, force: true })
  }
})

test('missing arguments are a usage error, exit 64', () => {
  assert.equal(detach(['start', 'only-socket']).status, 64)
  assert.equal(detach(['bogus']).status, 64)
})
