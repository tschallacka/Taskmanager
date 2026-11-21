// The dialog detector (crew/modal-detect.mjs), tested on fake screen text: the Pia dialog of 2026-11-14, a permission
// dialog, and screens that must not count (a question in prose, a transcript question with no footer, an empty screen).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findDialog, dialogMail } from './modal-detect.mjs'

const AUTO_MODE = [
  '  Claude Code v2 · model haiku',
  '',
  '? Teach auto mode about your environment? ...',
  '  It can read the shell history and other repos.',
  '  ❯ Continue',
  '    Cancel',
  '  Enter to continue · Esc to cancel'
].join('\n')

const PERMISSION = [
  'Bash command',
  '  rm -rf /srv/agents/x/worktree',
  '? Do you want to proceed?',
  '  1. Yes',
  '  2. No',
  '  Enter to confirm · Esc to cancel'
].join('\n')

test('the auto-mode dialog is found, and its first line is the one Boss needs', () => {
  assert.deepEqual(findDialog(AUTO_MODE), { first: '? Teach auto mode about your environment? ...' })
  assert.equal(dialogMail('pia', AUTO_MODE), 'PERSON-DIALOG pia: ? Teach auto mode about your environment? ...')
})

test('a permission dialog in a worker session is found the same way', () => {
  assert.equal(findDialog(PERMISSION).first, '? Do you want to proceed?')
  assert.equal(dialogMail('wade', PERMISSION), 'PERSON-DIALOG wade: ? Do you want to proceed?')
})

test('a box-drawn dialog is found, and the box edge is not part of the line', () => {
  const boxed = ['│ ? Overwrite the file? │', '│ Enter to confirm · Esc to cancel │'].join('\n')
  assert.equal(findDialog(boxed).first, '? Overwrite the file?')
})

test('a question in prose, with no footer, is not a dialog', () => {
  const prose = ['> why is the test red?', '? a question I asked earlier, no answer key here', 'the build is green'].join('\n')
  assert.equal(findDialog(prose), null)
  assert.equal(dialogMail('pia', prose), null)
})

test('a footer with no question line above it is not a dialog', () => {
  assert.equal(findDialog('Enter to continue · Esc to cancel'), null)
})

test('an empty or missing screen is no dialog', () => {
  assert.equal(findDialog(''), null)
  assert.equal(findDialog(undefined), null)
})

test('a very long question is cut to 200 characters with an ellipsis', () => {
  const long = `? ${'x'.repeat(400)}\n  Esc to cancel`
  const { first } = findDialog(long)
  assert.equal(first.length, 200)
  assert.ok(first.endsWith('…'))
})

// The script block runs when the file is run directly, also from a path with a space (card mwo4n5zrl63ri0scpmk). The
// old check built a file:// URL by hand, and a space never matched, so the script printed nothing.
test('run as a script from a path with a space, it reads the screen and answers', () => {
  const root = mkdtempSync(join(tmpdir(), 'md-'))
  try {
    const dir = join(root, 'crew home with space')
    mkdirSync(dir)
    const script = join(dir, 'modal-detect.mjs')
    copyFileSync(join(dirname(fileURLToPath(import.meta.url)), 'modal-detect.mjs'), script)
    const run = spawnSync(process.execPath, [script, 'pia'], { input: AUTO_MODE, encoding: 'utf8' })
    assert.equal(run.status, 0, `exit ${run.status}, stdout "${run.stdout}", stderr "${run.stderr}"`)
    assert.notEqual(run.stdout.trim(), 'NO-DIALOG')
    assert.notEqual(run.stdout.trim(), '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
