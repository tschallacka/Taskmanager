// The Pia watch's check (crew/pia-modal-check.mjs), tested on fake screen text: the auto-mode dialog of 2026-11-14, and
// screens that must not count. The check only reads: it never types, presses or moves anything.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { piaModalLine } from './pia-modal-check.mjs'

const CHECK = fileURLToPath(new URL('./pia-modal-check.mjs', import.meta.url))

const AUTO_MODE = [
  '  Claude Code v2 · model haiku',
  '',
  '? Teach auto mode about your environment? ...',
  '  Claude Code reads this project, your recent Claude sessions, and optionally your shell history.',
  '  ❯ Continue',
  '    Cancel',
  '  Enter to continue · Esc to cancel'
].join('\n')

const PLAIN = [
  '  Claude Code v2 · model haiku',
  '',
  '> wake: read your mail',
  '  ✓ Read 1 file',
  '  ready'
].join('\n')

const TRANSCRIPT_QUESTION = [
  '  Claude: ? why does the wake wait for a dialog',
  '  I will check the screen first.'
].join('\n')

test('the auto-mode dialog gives a PIA-MODAL line with its first line', () => {
  assert.equal(piaModalLine(AUTO_MODE), 'PIA-MODAL ? Teach auto mode about your environment? ...')
})

test('a plain screen and a question in the transcript give no PIA-MODAL line', () => {
  assert.equal(piaModalLine(PLAIN), null)
  assert.equal(piaModalLine(TRANSCRIPT_QUESTION), null)
  assert.equal(piaModalLine(''), null)
})

test('the script prints PIA-MODAL and exits 0 on a dialog, NO-PIA-MODAL and exits 1 otherwise', () => {
  const hit = spawnSync(process.execPath, [CHECK], { input: AUTO_MODE, encoding: 'utf8' })
  assert.equal(hit.status, 0)
  assert.equal(hit.stdout.trim(), 'PIA-MODAL ? Teach auto mode about your environment? ...')

  const miss = spawnSync(process.execPath, [CHECK], { input: PLAIN, encoding: 'utf8' })
  assert.equal(miss.status, 1)
  assert.equal(miss.stdout.trim(), 'NO-PIA-MODAL')
})
