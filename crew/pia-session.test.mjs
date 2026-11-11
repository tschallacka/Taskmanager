// crew pia-session: the folder Claude Code uses for Pia's working directory, and the newest transcript in it.
// Each test works in a throwaway folder it removes itself. Run:
//   node --test crew/pia-session.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { piaProjectDir, piaSessionName } from './pia-session.mjs'

const CREW_HOME = '/srv/agents/taskmanager-maintenance/.config/taskmanager-crew'

function scratch() {
  return mkdtempSync(join(tmpdir(), 'pia-session-test-'))
}

test('the project folder is the working directory with "/" and "." turned into "-"', () => {
  assert.equal(
    piaProjectDir(CREW_HOME, '/home/x/.claude'),
    '/home/x/.claude/projects/-srv-agents-taskmanager-maintenance--config-taskmanager-crew-pia-session'
  )
})

test('the newest transcript is the current session, named pia-session-<id>', () => {
  const claude = scratch()
  try {
    const dir = piaProjectDir(CREW_HOME, claude)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'aaaa-old.jsonl'), '{}\n')
    writeFileSync(join(dir, 'bbbb-new.jsonl'), '{}\n')
    writeFileSync(join(dir, 'notes.txt'), 'not a transcript')
    utimesSync(join(dir, 'aaaa-old.jsonl'), new Date('2026-11-10T10:00:00Z'), new Date('2026-11-10T10:00:00Z'))
    utimesSync(join(dir, 'bbbb-new.jsonl'), new Date('2026-11-11T10:00:00Z'), new Date('2026-11-11T10:00:00Z'))
    const answer = piaSessionName(CREW_HOME, claude)
    assert.equal(answer.ok, true)
    assert.equal(answer.name, 'pia-session-bbbb-new')
  } finally {
    rmSync(claude, { recursive: true, force: true })
  }
})

test('no folder, or no transcript, is a refusal with the reason, not a name', () => {
  const claude = scratch()
  try {
    assert.equal(piaSessionName(CREW_HOME, claude).ok, false)
    mkdirSync(piaProjectDir(CREW_HOME, claude), { recursive: true })
    const answer = piaSessionName(CREW_HOME, claude)
    assert.equal(answer.ok, false)
    assert.match(answer.reason, /no Pia session transcript yet/)
  } finally {
    rmSync(claude, { recursive: true, force: true })
  }
})
