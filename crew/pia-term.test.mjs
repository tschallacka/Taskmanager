// crew pia-term.sh: view, paste and key, against a fake interactive-shell MCP binary that logs what it is sent.
// Each test works in a throwaway folder it removes itself. Run:
//   node --test crew/pia-term.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, 'pia-term.sh')

// A fake server: for each tools/call it logs "<name> <arguments>" and answers with a screen for view.
const FAKE = `#!/usr/bin/env node
const fs = require('node:fs')
const log = process.env.FAKE_LOG
let buf = ''
process.stdin.on('data', d => { buf += d })
process.stdin.on('end', () => {
  for (const line of buf.split('\\n')) {
    if (!line.trim()) continue
    const msg = JSON.parse(line)
    if (msg.method !== 'tools/call') continue
    fs.appendFileSync(log, msg.params.name + ' ' + JSON.stringify(msg.params.arguments) + '\\n')
    const text = msg.params.name === 'view'
      ? JSON.stringify({ responses: [{ text: 'SCREEN LINE' }] })
      : '{}'
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text }] } }) + '\\n')
  }
})
`

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'pia-term-test-'))
  const bin = join(dir, 'fake-mcp')
  writeFileSync(bin, FAKE)
  chmodSync(bin, 0o755)
  return { dir, bin, log: join(dir, 'calls.log') }
}

function term(env, args) {
  return spawnSync('sh', [SCRIPT, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 60000
  })
}

test('view prints the screen the server answers, for the session named in PIA_SESSION', () => {
  const t = setup()
  try {
    const run = term({ INTERACTIVE_SHELL_MCP: t.bin, FAKE_LOG: t.log, PIA_SESSION: 'pia-test' }, ['view', '1-5'])
    assert.equal(run.status, 0, run.stderr)
    assert.equal(run.stdout.trim(), 'SCREEN LINE')
    assert.match(readFileSync(t.log, 'utf8'), /^view \{"session":"pia-test","row_ranges":\["1-5"\]\}/)
  } finally {
    rmSync(t.dir, { recursive: true, force: true })
  }
})

test('paste sends the text to the session, then one ENTER key', () => {
  const t = setup()
  try {
    const run = term({ INTERACTIVE_SHELL_MCP: t.bin, FAKE_LOG: t.log }, ['paste', 'resume your loop'])
    assert.equal(run.status, 0, run.stderr)
    assert.equal(run.stdout.trim(), 'pasted')
    const lines = readFileSync(t.log, 'utf8').trim().split('\n')
    assert.deepEqual(lines, [
      'paste {"session":"pia","text":"resume your loop"}',
      'key {"session":"pia","key":"ENTER"}'
    ])
  } finally {
    rmSync(t.dir, { recursive: true, force: true })
  }
})

test('key sends one named key', () => {
  const t = setup()
  try {
    const run = term({ INTERACTIVE_SHELL_MCP: t.bin, FAKE_LOG: t.log }, ['key', 'ESC'])
    assert.equal(run.status, 0, run.stderr)
    assert.equal(run.stdout.trim(), 'sent')
    assert.equal(readFileSync(t.log, 'utf8').trim(), 'key {"session":"pia","key":"ESC"}')
  } finally {
    rmSync(t.dir, { recursive: true, force: true })
  }
})

test('no command is a usage error, exit 64, and nothing is sent', () => {
  const t = setup()
  try {
    const run = term({ INTERACTIVE_SHELL_MCP: t.bin, FAKE_LOG: t.log }, [])
    assert.equal(run.status, 64)
    assert.match(run.stderr, /usage: sh pia-term.sh/)
    assert.throws(() => readFileSync(t.log, 'utf8'), /ENOENT/)
  } finally {
    rmSync(t.dir, { recursive: true, force: true })
  }
})
