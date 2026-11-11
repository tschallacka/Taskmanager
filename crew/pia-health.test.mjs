// crew pia-health: the findings about Pia's session, against a fake /proc and a fake transcript folder.
// Each test works in a throwaway folder it removes itself. Run:
//   node --test crew/pia-health.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { piaFindings, FRESH_MINUTES } from './pia-health.mjs'
import { piaProjectDir } from './pia-session.mjs'

const CREW_HOME = '/srv/agents/taskmanager-maintenance/.config/taskmanager-crew'
const NOW = Date.parse('2026-11-11T12:00:00Z')

// A fake /proc: one folder per process, with a `cwd` link and a `cmdline` file.
function fakeProc(root, processes) {
  for (const p of processes) {
    const dir = join(root, String(p.pid))
    mkdirSync(dir, { recursive: true })
    symlinkSync(p.cwd, join(dir, 'cwd'))
    writeFileSync(join(dir, 'cmdline'), p.cmdline.split(' ').join('\0') + '\0')
  }
}

function setup(transcriptAgeMinutes) {
  const root = mkdtempSync(join(tmpdir(), 'pia-health-test-'))
  const claude = join(root, 'claude')
  const proc = join(root, 'proc')
  mkdirSync(proc, { recursive: true })
  const folder = piaProjectDir(CREW_HOME, claude)
  if (transcriptAgeMinutes !== null) {
    mkdirSync(folder, { recursive: true })
    const file = join(folder, 'ab12-session.jsonl')
    writeFileSync(file, '{}\n')
    const when = new Date(NOW - transcriptAgeMinutes * 60000)
    utimesSync(file, when, when)
  }
  return { root, claude, proc, folder }
}

const run = (env) => piaFindings({ crewHome: CREW_HOME, claudeDir: env.claude, procDir: env.proc, now: NOW })

test('all three checks fine: Claude in her folder, her listener, a fresh transcript', () => {
  const env = setup(3)
  try {
    fakeProc(env.proc, [
      { pid: '101', cwd: join(CREW_HOME, 'pia-session'), cmdline: 'claude --continue --model claude-haiku-5-5' },
      { pid: '202', cwd: '/srv/agents/taskmanager-maintenance/taskmanager-wick-mw9jaz8', cmdline: 'node /x/listen.mjs pia 600' }
    ])
    const found = run(env)
    assert.deepEqual(found.map(f => f.ok), [true, true, true, true])
    assert.equal(found[0].line, 'session: alive (pid 101)')
    assert.equal(found[1].line, 'listener: running (pid 202)')
    assert.equal(found[2].line, 'transcript: written 3 min ago')
  } finally {
    rmSync(env.root, { recursive: true, force: true })
  }
})

test('a Claude Code process in another folder, and a listener for someone else, do not count', () => {
  const env = setup(3)
  try {
    fakeProc(env.proc, [
      { pid: '301', cwd: '/srv/elsewhere', cmdline: 'claude' },
      { pid: '302', cwd: '/srv/elsewhere', cmdline: 'node listen.mjs wren 600' }
    ])
    const found = run(env)
    assert.equal(found[0].ok, false)
    assert.match(found[0].line, /session: not running/)
    assert.equal(found[1].ok, false)
    assert.match(found[1].line, /listener: not running/)
  } finally {
    rmSync(env.root, { recursive: true, force: true })
  }
})

test('a transcript older than the fresh window is reported, and the window is 20 minutes', () => {
  assert.equal(FRESH_MINUTES, 20)
  const env = setup(45)
  try {
    const found = run(env)
    assert.equal(found[2].ok, false)
    assert.equal(found[2].line, 'transcript: last written 45 min ago (more than 20)')
  } finally {
    rmSync(env.root, { recursive: true, force: true })
  }
})

test('no transcript at all is a failed transcript check, and the dialog line says it is not checked', () => {
  const env = setup(null)
  try {
    const found = run(env)
    assert.equal(found[2].ok, false)
    assert.match(found[2].line, /transcript: none/)
    assert.equal(found[3].ok, true)
    assert.match(found[3].line, /dialog: not checked here/)
  } finally {
    rmSync(env.root, { recursive: true, force: true })
  }
})
