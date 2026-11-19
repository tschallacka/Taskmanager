// Pia's terminal adapter (pia-term.sh) on a real tmux with a throwaway socket: the program in the session is `cat`, so what
// is pasted comes back on the screen. Nothing touches the crew's own tmux.sock. Run:
//   node --test crew/pia-term.test.mjs
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ADAPTER = join(here, 'pia-term.sh')
const hasTmux = spawnSync('tmux', ['-V']).status === 0
const home = mkdtempSync(join(tmpdir(), 'pia-term-home-'))
const sock = join(home, 'tmux.sock')
const tmux = args => spawnSync('tmux', ['-S', sock, ...args], { encoding: 'utf8' })
const adapter = (...args) => spawnSync('sh', [ADAPTER, ...args], { encoding: 'utf8', env: { ...process.env, CREW_HOME: home } })
const startPia = () => tmux(['new-session', '-d', '-s', 'pia', '-x', '120', '-y', '40', 'cat'])

before(() => {
  if (hasTmux) startPia()
})
after(() => {
  if (hasTmux) tmux(['kill-server'])
})

test('view with no pia session says so and exits 1 on the throwaway socket', { skip: !hasTmux }, () => {
  tmux(['kill-session', '-t', 'pia'])
  const run = adapter('view')
  assert.equal(run.status, 1)
  assert.match(run.stderr, /pia: no terminal/)
  startPia()
})

test('paste types the text and presses Enter; the text shows on the screen', { skip: !hasTmux }, () => {
  const run = adapter('paste', 'crew adapter check one')
  assert.equal(run.status, 0)
  assert.equal(run.stdout.trim(), 'pasted')
  let screen = ''
  for (let i = 0; i < 20 && !screen.includes('crew adapter check one'); i += 1) {
    spawnSync('sleep', ['0.2'])
    screen = adapter('view', '1-40').stdout
  }
  assert.match(screen, /crew adapter check one/)
})

test('view answers only the rows asked for', { skip: !hasTmux }, () => {
  const run = adapter('view', '1-3')
  assert.equal(run.status, 0)
  assert.ok(run.stdout.split('\n').filter(Boolean).length <= 3)
})

test('key sends one key to the session', { skip: !hasTmux }, () => {
  const run = adapter('key', 'C-u')
  assert.equal(run.status, 0)
  assert.equal(run.stdout.trim(), 'sent')
})

test('no arguments is a usage error (exit 64)', () => {
  const run = adapter()
  assert.equal(run.status, 64)
  assert.match(run.stderr, /usage: sh pia-term.sh/)
})

test('the adapter names the crew socket, not the interactive-shell session', () => {
  const text = readFileSync(ADAPTER, 'utf8')
  assert.match(text, /tmux\.sock/)
  assert.doesNotMatch(text, /interactive-shell/)
  assert.doesNotMatch(text, /term\.sock/)
})
