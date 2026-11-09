// Tests for the Claude Code profile of the crew: the file, the list that ships it, the `crew claude` command,
// and the README section that names every variable it sets. Run from the repo root:
//   node --test crew/claude-profile.test.mjs
//
// Needs nothing: no network, no Claude Code, no board. It reads the kit's own files.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const KIT = dirname(fileURLToPath(import.meta.url))
const read = name => readFileSync(join(KIT, name), 'utf8')

// The variables the profile must set, with the value it is checked to be. Each value is in milliseconds, or a
// character count, or the minutes/hours written in the README table.
const EXPECTED = {
  BASH_DEFAULT_TIMEOUT_MS: '1800000',
  BASH_MAX_TIMEOUT_MS: '7200000',
  CLAUDE_CODE_AUTO_BACKGROUND_TIMEOUT_MS: '1800000',
  BASH_MAX_OUTPUT_LENGTH: '150000',
  MCP_TIMEOUT: '60000',
  CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS: '600000',
  CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT: '1800000',
  CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS: '3600000',
}

describe('the profile file', () => {
  test('is valid JSON with an env block of string values, and sets exactly the expected variables', () => {
    const profile = JSON.parse(read('claude-long-run.json'))
    assert.deepEqual(Object.keys(profile), ['env'])
    for (const [name, value] of Object.entries(profile.env)) assert.equal(typeof value, 'string', `${name} is a string`)
    assert.deepEqual(profile.env, EXPECTED)
  })

  test('the output limit is at the most Claude Code accepts (150,000 characters)', () => {
    const profile = JSON.parse(read('claude-long-run.json'))
    assert.ok(Number(profile.env.BASH_MAX_OUTPUT_LENGTH) <= 150000)
  })

  test('the file is in the kit list, so the board ships it and `crew update` installs it', () => {
    const list = read('kit-files.txt').split('\n').map(line => line.trim())
    assert.ok(list.includes('claude-long-run.json'), 'claude-long-run.json is listed')
    assert.ok(list.includes('CLAUDE-LIMITS.md'), 'CLAUDE-LIMITS.md is listed')
  })
})

describe('the README section', () => {
  const readme = read('README.md')
  const start = readme.indexOf('## Claude Code limits')
  const end = readme.indexOf('## Updating', start)
  const section = start >= 0 && end > start ? readme.slice(start, end) : ''

  test('exists and sits before "Updating"', () => {
    assert.ok(start >= 0, 'the section heading is in README.md')
    assert.ok(end > start, '"Updating" follows it')
  })

  test('names every variable the profile sets, so a reader can see what each one changes', () => {
    for (const name of Object.keys(EXPECTED)) assert.ok(section.includes(`\`${name}\``), `${name} is named`)
  })

  test('says how to start a session with the profile and that only that session gets it', () => {
    assert.ok(section.includes('crew claude'), 'the command is named')
    assert.ok(section.includes('--settings'), 'the flag is named')
    assert.ok(/only that session|that session only/i.test(section), 'the scope is stated')
  })

  test('says what cannot be raised and which Claude Code version the values were checked against', () => {
    assert.ok(/Monitor/.test(section), 'Monitor is named')
    assert.ok(/150,000/.test(section), 'the output cap is named')
    assert.ok(section.includes('2.1.319'), 'the checked version is named')
  })
})

describe('the crew command', () => {
  test('`crew claude` passes the profile with --settings, using the kit folder it ships in', () => {
    const crew = read('crew.mjs')
    assert.ok(/first === 'claude'/.test(crew), 'the claude branch exists')
    assert.ok(/'--settings', join\(kit, 'claude-long-run\.json'\)/.test(crew), 'the profile is passed with --settings')
  })

  test('the usage comment names the command', () => {
    assert.ok(read('crew.mjs').includes('crew claude [args]'), 'the usage comment lists it')
  })
})
