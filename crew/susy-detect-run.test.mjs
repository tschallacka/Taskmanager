// Susy's detection through the daemon's tick (card mwnzgxz5uschuba1y7): a throwaway CREW_HOME, fake job states under a
// fake CREW_JOBS folder, and a fake `claude agents` list. Dry-run only: it logs the problem once and mails nothing.
// Run: node --test crew/susy-detect-run.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runOnce } from './susy-daemon.mjs'

const NOW = Date.parse('2026-11-19T20:30:00.000Z')
const MIN = 60000

function fakeHome() {
  const home = mkdtempSync(join(tmpdir(), 'susy-detect-run-'))
  mkdirSync(join(home, '.listen'), { recursive: true })
  writeFileSync(join(home, 'crew.json'), JSON.stringify({ people: {}, susy: {} }))
  const jobs = mkdtempSync(join(tmpdir(), 'susy-jobs-'))
  mkdirSync(join(jobs, 'n1'))
  writeFileSync(join(jobs, 'n1', 'state.json'), JSON.stringify({
    state: 'working',
    tempo: 'blocked',
    detail: 'API Error: Connection lost mid-response',
    tokens: 9000,
    updatedAt: new Date(NOW - 12 * MIN).toISOString()
  }))
  return { home, jobs }
}

test('dry-run tick: a blocked session is logged once, with who, the error and the age, and nothing is mailed', async () => {
  const { home, jobs } = fakeHome()
  process.env.CREW_JOBS = jobs
  try {
    const agentList = [{ id: 'n1', sessionId: 'n1', name: 'taskmanager-maintenance-nina', status: 'idle' }]
    await runOnce(home, NOW, { agentList })
    const log = readFileSync(join(home, '.listen', 'susy-daemon-dryrun.log'), 'utf8')
    assert.match(log, /would mail boss: susy: session blocked by an API error: taskmanager-maintenance-nina/)
    assert.match(log, /API Error: Connection lost mid-response/)
    assert.match(log, /\(12 min\)/)
    await runOnce(home, NOW + MIN, { agentList })
    const again = readFileSync(join(home, '.listen', 'susy-daemon-dryrun.log'), 'utf8')
    assert.equal(again.split('would mail boss: susy: session blocked').length - 1, 1, 'the same problem is logged once, not on every tick')
  } finally {
    delete process.env.CREW_JOBS
  }
})

test('dry-run tick: no session list (claude agents did not answer) adds no session problem', async () => {
  const { home, jobs } = fakeHome()
  process.env.CREW_JOBS = jobs
  try {
    await runOnce(home, NOW, { agentList: null })
    const log = existsLog(home)
    assert.doesNotMatch(log, /susy: session blocked/)
  } finally {
    delete process.env.CREW_JOBS
  }
})

function existsLog(home) {
  try {
    return readFileSync(join(home, '.listen', 'susy-daemon-dryrun.log'), 'utf8')
  } catch {
    return ''
  }
}
