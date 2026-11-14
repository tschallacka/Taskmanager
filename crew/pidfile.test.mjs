// The pid files of the listener and the watches: a process that wrote its pid is found while it runs, with the command
// it was started with; a dead process, a reused pid (another command) and a missing or malformed file are not found.
//   node --import tsx --test crew/pidfile.test.mjs   (or: node --test crew/pidfile.test.mjs)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commandLine, livePid, pidFile, writePidFile } from './pidfile.mjs'

function home() {
  return mkdtempSync(join(tmpdir(), 'pidfile-test-'))
}

test('a running listener is found by its pid file, while it runs, and not after it ends', async () => {
  const dir = home()
  // The command line of a listener: node ... listen.mjs pia 3600
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)', 'listen.mjs', 'pia', '3600'], { stdio: 'ignore' })
  try {
    mkdirSync(join(dir, '.listen'))
    writeFileSync(pidFile(dir, 'pia'), `${child.pid}\n`)
    assert.equal(livePid(dir, 'pia', 'listen.mjs pia'), child.pid)
    assert.match(commandLine(child.pid) ?? '', /listen\.mjs pia 3600/)
    assert.equal(livePid(dir, 'pia', 'crew.mjs watch-crew'), null, 'a pid of another command is not a match')
  } finally {
    child.kill()
    await new Promise(resolve => child.once('exit', resolve))
  }
  assert.equal(livePid(dir, 'pia', 'listen.mjs pia'), null, 'a process that has ended is not running')
  rmSync(dir, { recursive: true, force: true })
})

test('writePidFile records this process, under CREW_HOME/.listen', () => {
  const dir = home()
  writePidFile(dir, 'boss-mentions')
  assert.equal(livePid(dir, 'boss-mentions', 'node'), process.pid)
  rmSync(dir, { recursive: true, force: true })
})

test('a missing, malformed or nonsense pid file is not running', () => {
  const dir = home()
  assert.equal(livePid(dir, 'pia', 'listen.mjs pia'), null, 'no file')
  mkdirSync(join(dir, '.listen'))
  writeFileSync(pidFile(dir, 'pia'), 'not a pid\n')
  assert.equal(livePid(dir, 'pia', 'listen.mjs pia'), null, 'malformed')
  writeFileSync(pidFile(dir, 'pia'), '0\n')
  assert.equal(livePid(dir, 'pia', 'listen.mjs pia'), null, 'pid 0')
  rmSync(dir, { recursive: true, force: true })
})

test('a pid whose command cannot be read (no /proc entry) is not running', () => {
  const dir = home()
  mkdirSync(join(dir, '.listen'))
  writeFileSync(pidFile(dir, 'pia'), '123456789\n')
  assert.equal(livePid(dir, 'pia', 'listen.mjs pia', () => null), null)
  assert.equal(livePid(dir, 'pia', 'listen.mjs pia', () => 'node /x/listen.mjs pia 3600'), 123456789)
  rmSync(dir, { recursive: true, force: true })
})
