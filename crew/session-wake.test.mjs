// The typing script (crew/session-wake.sh) against a fake terminal behind the interactive-shell MCP. The fake keeps a size
// set by `start` (24 rows when none is given, as the tool does), answers `view` with an error for a row past that size and
// for the first `late` views (the terminal is not up yet), and logs every call. No real session, no real typing.
// Run: node --test crew/session-wake.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { terminalName } from './wake.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, 'session-wake.sh')
const ID = '1f592988'

// The default screen is claude's layout: the input line between two rules, and the status line under them.
const READY = '─────────────\n❯ ready\n─────────────\n  ⏵⏵ auto mode on (shift+tab to cycle)'
function fakeTerminal({ failOn = [], late = 0, screen = READY } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wake-term-'))
  const log = join(dir, 'calls.log')
  const bin = join(dir, 'mcp')
  writeFileSync(bin, `#!/usr/bin/env node
const fs = require('node:fs')
const lines = fs.readFileSync(0, 'utf8').trim().split('\\n')
const last = JSON.parse(lines[lines.length - 1])
const name = (last.params && last.params.name) || 'init'
const args = (last.params && last.params.arguments) || {}
const LOG = ${JSON.stringify(log)}
const prior = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\\n').filter(Boolean).map(l => JSON.parse(l)) : []
fs.appendFileSync(LOG, JSON.stringify({ name, args }) + '\\n')
const reply = result => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result }) + '\\n')
const fail = text => reply({ isError: true, content: [{ type: 'text', text }] })
const done = text => reply({ content: [{ type: 'text', text }] })
const starts = prior.filter(c => c.name === 'start')
const rows = starts.length ? (starts[starts.length - 1].args.rows || 24) : 24
if (name === 'view') {
  const views = prior.filter(c => c.name === 'view').length
  const past = (args.row_ranges || []).map(r => Number(String(r).split('-').pop())).find(n => n > rows)
  if (past) return fail('row ' + past + ' is outside the ' + rows + '-row screen')
  if (views < ${late}) return fail('terminal not up yet')
  return done(JSON.stringify({ responses: [{ text: ${JSON.stringify(screen)} }] }))
}
if (${JSON.stringify(failOn)}.includes(name)) return fail('refused')
done('ok')
`)
  chmodSync(bin, 0o755)
  return { bin, log }
}

const calls = mcp => (existsSync(mcp.log) ? readFileSync(mcp.log, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [])

function run(mcp, { terminal, env = {} } = {}) {
  const argv = [SCRIPT, ID, 'hello', ...(terminal ? [terminal] : [])]
  return spawnSync('sh', argv, {
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, SESSION_WAKE_MCP: mcp.bin, WAKE_PROMPT_WAIT: '4', WAKE_POLL_SECONDS: '1', ...env }
  })
}

const lastLine = text => text.trim().split('\n').pop()

test('the attach terminal starts at 200x50, and every row it reads exists on that screen', () => {
  const mcp = fakeTerminal()
  const r = run(mcp)
  assert.equal(r.status, 0, r.stderr)
  const start = calls(mcp).find(c => c.name === 'start')
  assert.equal(start.args.cols, 200)
  assert.equal(start.args.rows, 50)
  const views = calls(mcp).filter(c => c.name === 'view')
  assert.ok(views.length >= 1)
  for (const v of views) {
    for (const range of v.args.row_ranges) assert.ok(Number(range.split('-').pop()) <= 50, `row ${range} is past the 50-row screen`)
  }
  assert.match(r.stdout, /typed into session 1f592988/)
})

test('a late terminal is waited for: the script polls until the prompt shows, then types', () => {
  const mcp = fakeTerminal({ late: 2 })
  // A wide wait: the suite runs many tests at once on a loaded machine, and two failed polls must not run out the clock.
  const r = run(mcp, { env: { WAKE_PROMPT_WAIT: '20' } })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(calls(mcp).filter(c => c.name === 'view').length, 3, 'two failed views, then the one that shows the prompt')
  assert.ok(calls(mcp).some(c => c.name === 'paste'), 'the text was pasted')
})

test('a terminal that never answers in time: exit 3, the tool error line is the reason, and nothing is typed', () => {
  const mcp = fakeTerminal({ late: 100000 })
  const r = run(mcp, { env: { WAKE_PROMPT_WAIT: '3' } })
  assert.equal(r.status, 3, r.stderr)
  assert.match(lastLine(r.stderr), /^SCREEN-UNREADABLE session 1f592988: .*terminal not up yet/)
  assert.ok(!calls(mcp).some(c => c.name === 'paste' || c.name === 'key'), 'nothing typed')
})

test('a short screen with the input line between its rules is read and typed into', () => {
  const mcp = fakeTerminal({ screen: '─────\n❯\n─────' })
  const r = run(mcp)
  assert.equal(r.status, 0, r.stderr)
  assert.ok(calls(mcp).some(c => c.name === 'key'), 'Enter was pressed')
})

test('a screen with no claude prompt on it is not read as ready: exit 3, the reason says so, nothing typed', () => {
  const mcp = fakeTerminal({ screen: 'loading plugins...' })
  const r = run(mcp, { env: { WAKE_PROMPT_WAIT: '2' } })
  assert.equal(r.status, 3, r.stderr)
  assert.match(lastLine(r.stderr), /^SCREEN-UNREADABLE session 1f592988: .*no claude prompt/)
  assert.ok(!calls(mcp).some(c => c.name === 'paste' || c.name === 'key'), 'nothing typed')
})

test('a transcript "> " line with no input line is not a prompt: exit 3, nothing typed', () => {
  const mcp = fakeTerminal({ screen: '> the card says to fix the prompt check\n● Reading it now.\n  ⎿ 3 files changed' })
  const r = run(mcp, { env: { WAKE_PROMPT_WAIT: '2' } })
  assert.equal(r.status, 3, r.stderr)
  assert.match(lastLine(r.stderr), /^SCREEN-UNREADABLE session 1f592988: .*no claude prompt/)
  assert.ok(!calls(mcp).some(c => c.name === 'paste' || c.name === 'key'), 'nothing typed')
})

test('a transcript "❯" message is not the input line either: no rules around it, so exit 3 and nothing typed', () => {
  const mcp = fakeTerminal({ screen: '❯ wake test, ignore\n● Noted. Nothing to do.\n\n  ⏵⏵ auto mode on' })
  const r = run(mcp, { env: { WAKE_PROMPT_WAIT: '2' } })
  assert.equal(r.status, 3, r.stderr)
  assert.ok(!calls(mcp).some(c => c.name === 'paste' || c.name === 'key'), 'nothing typed')
})

test('the terminal is named for its target (sessionwake-<key>), and every call uses that name', () => {
  const mcp = fakeTerminal()
  const r = run(mcp, { terminal: 'sessionwake-wren' })
  assert.equal(r.status, 0, r.stderr)
  const named = calls(mcp).filter(c => c.args.session !== undefined)
  assert.ok(named.length > 0)
  for (const c of named) assert.equal(c.args.session, 'sessionwake-wren', c.name)
})

test('without a terminal name the script uses sessionwake-<id>, not one shared name', () => {
  const mcp = fakeTerminal()
  const r = run(mcp)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(calls(mcp).find(c => c.name === 'start').args.session, 'sessionwake-1f592988')
})

test('wake.mjs names the terminal sessionwake-<key>, and strips anything but letters, digits, dash and underscore', () => {
  assert.equal(terminalName('wren'), 'sessionwake-wren')
  assert.equal(terminalName('wick-2'), 'sessionwake-wick-2')
  assert.equal(terminalName('x;touch y'), 'sessionwake-xtouchy')
  assert.equal(terminalName(undefined), 'sessionwake-')
})

// prompt-line.mjs run from a path with a space: its main block must still run, or every screen reads as ready (fail-open).
test('prompt-line.mjs run from a directory with a space still reads a transcript-only screen as not ready (exit 1)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wake pl space '))
  writeFileSync(join(dir, 'prompt-line.mjs'), readFileSync(join(HERE, 'prompt-line.mjs')))
  writeFileSync(join(dir, 'modal-detect.mjs'), readFileSync(join(HERE, 'modal-detect.mjs')))
  const r = spawnSync('node', [join(dir, 'prompt-line.mjs')], {
    encoding: 'utf8',
    input: '> the card says to fix the prompt check\n● Reading it now.\n  ⎿ 3 files changed\n',
    timeout: 60000
  })
  assert.equal(r.status, 1, `exit ${r.status}: a transcript-only screen must not read as ready (${r.stderr})`)
})

test('a terminal name with a space or a metacharacter is refused before any tool call', () => {
  const mcp = fakeTerminal()
  const r = run(mcp, { terminal: 'sessionwake-x;y' })
  assert.equal(r.status, 64, r.stderr)
  assert.equal(calls(mcp).length, 0, 'no tool was called')
})
