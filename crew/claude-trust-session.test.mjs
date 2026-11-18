// The start works after the trust call (card mwk8koh1xf1jikjrkff, step 5). A fake claude stands in for the real one: it reads the
// trust flag for its working folder from the config file (CLAUDE_CONFIG_DIR), and refuses with 'not trusted' when the flag is not
// set, as the real one does. Nothing real is started and no real config file is touched.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startSession } from './session.mjs'
import { trustForStart } from './claude-trust.mjs'

const KIT = join(tmpdir(), 'claude-trust-session-kit')

function fakeClaude(dir, key) {
  const bin = join(dir, 'claude')
  writeFileSync(bin, `#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const args = process.argv.slice(2)
if (args[0] === 'agents') {
  console.log(JSON.stringify([{ id: 'abcdef12', name: ${JSON.stringify(key)}, state: 'running', status: '', startedAt: Date.now() }]))
  process.exit(0)
}
const cwd = process.cwd()
let trusted = false
try {
  trusted = JSON.parse(fs.readFileSync(path.join(process.env.CLAUDE_CONFIG_DIR, '.claude.json'), 'utf8')).projects?.[cwd]?.hasTrustDialogAccepted === true
} catch {}
if (!trusted) {
  console.error('Workspace not trusted: ' + cwd)
  process.exit(1)
}
process.exit(0)
`)
  chmodSync(bin, 0o755)
  return bin
}

function setup() {
  const base = mkdtempSync(join(tmpdir(), 'claude-trust-session-base-'))
  const folder = join(base, 'taskmanager-wick-trust')
  mkdirSync(folder)
  const home = mkdtempSync(join(tmpdir(), 'claude-trust-session-home-'))
  writeFileSync(join(home, 'crew.json'), `${JSON.stringify({ worktreeBase: base })}\n`)
  mkdirSync(join(home, 'sessions'), { recursive: true })
  const cfg = mkdtempSync(join(tmpdir(), 'claude-trust-session-cfg-'))
  writeFileSync(join(cfg, '.claude.json'), `${JSON.stringify({ projects: {} })}\n`, { mode: 0o600 })
  const bin = fakeClaude(home, 'wick')
  return { base, folder, home, cfg, bin }
}

test('the start works after the trust call: claude finds the folder trusted and the session is recorded', () => {
  const { folder, home, cfg, bin } = setup()
  process.env.CLAUDE_CONFIG_DIR = cfg
  try {
    const trusted = trustForStart({ home, kit: KIT, folder, file: join(cfg, '.claude.json'), worktreeBase: readBase(home), folders: [] })
    assert.equal(trusted.ok, true)
    const out = startSession({ home, kit: KIT, key: 'wick', folder, role: 'r', bin })
    assert.equal(out.ok, true, out.reason)
    assert.equal(out.started, true)
  } finally {
    delete process.env.CLAUDE_CONFIG_DIR
  }
})

test('without the trust call, claude refuses the folder, and the start reports the path and what crew update does', () => {
  const { folder, home, cfg, bin } = setup()
  process.env.CLAUDE_CONFIG_DIR = cfg
  try {
    // The trust step is skipped here on purpose: the start then meets claude's own refusal.
    const out = startSession({ home, kit: KIT, key: 'wick', folder, role: 'r', bin, trust: () => ({ ok: true }) })
    assert.equal(out.ok, false)
    assert.match(out.reason, new RegExp(folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the reason names the folder')
    assert.match(out.reason, /crew update/)
    assert.doesNotMatch(out.reason, /accept/i)
  } finally {
    delete process.env.CLAUDE_CONFIG_DIR
  }
})

test('the default start (no trust stub) trusts the crew folder itself, so claude starts it', () => {
  const { folder, home, cfg, bin } = setup()
  process.env.CLAUDE_CONFIG_DIR = cfg
  try {
    const out = startSession({ home, kit: KIT, key: 'wick', folder, role: 'r', bin })
    assert.equal(out.ok, true, out.reason)
    const projects = JSON.parse(readFileSync(join(cfg, '.claude.json'), 'utf8')).projects
    assert.equal(projects[folder].hasTrustDialogAccepted, true)
  } finally {
    delete process.env.CLAUDE_CONFIG_DIR
  }
})

function readBase(home) {
  return JSON.parse(readFileSync(join(home, 'crew.json'), 'utf8')).worktreeBase
}
