// board-health.mjs prints one line when run as a script (card mwifm8qa5n044bzymkl). A path with a space must still run
// the script: the Stop hook reads that line, and an empty answer used to look like a healthy board. The test copies the
// script into a folder with a space in its name and runs it with no creds.json, so the answer is the "no board address"
// line and needs no network. Run:
//   cd crew && node --test board-health.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

test('board-health run from a path with a space prints its one line', () => {
  const root = mkdtempSync(join(tmpdir(), 'bh-'))
  try {
    const dir = join(root, 'crew home with space')
    mkdirSync(dir)
    const script = join(dir, 'board-health.mjs')
    copyFileSync(join(here, 'board-health.mjs'), script)
    const out = execFileSync(process.execPath, [script, join(root, 'no-such-home')], { encoding: 'utf8' })
    assert.equal(out.trim(), 'down: no board address in creds.json')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
