// The worker guide tells a worker how to wait for a long job without a wait loop that matches itself (card mwaxinhcj9bm9oyih3o).
// `until ! pgrep -f "x"; do sleep 8; done` finds its own command line, so it never ends. The guide must say so, and no kit
// file may ship such a loop. Run from the repo root: node --test crew/wait-guide.test.mjs
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const KIT = dirname(fileURLToPath(import.meta.url))
const CREW_GUIDE = readFileSync(join(KIT, 'CREW.md.tmpl'), 'utf8')

test('the worker guide has a section on waiting for a job, and names the self-matching loop', () => {
  const start = CREW_GUIDE.indexOf('## Waiting on a job')
  assert.ok(start >= 0, 'a section "Waiting on a job" exists in CREW.md.tmpl')
  const section = CREW_GUIDE.slice(start, CREW_GUIDE.indexOf('\n## ', start + 1))
  assert.match(section, /pgrep -f/, 'the section names pgrep -f')
  assert.match(section, /never/i, 'it says never to wait that way')
  assert.match(section, /process id/i, 'it says to wait on the process id from the launch')
})

test('no kit file ships a wait loop built on pgrep -f', () => {
  // This file quotes the loop in its comments, so the scan skips the test files.
  const files = readdirSync(KIT).filter(name => /\.(tmpl|md|mjs|sh)$/.test(name) && !name.endsWith('.test.mjs'))
  for (const name of files) {
    const text = readFileSync(join(KIT, name), 'utf8')
    assert.doesNotMatch(text, /(until|while)\s+!?\s*pgrep\s+-f/, `${name} has a pgrep -f wait loop`)
  }
})
