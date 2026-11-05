// The commands a person pastes to connect Claude Code, or to replace a key that is already connected.
// Needs nothing but the module. Run:
//   node --import tsx --test tests/agent-setup.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exportKeyCommand, KEY_VARIABLE_HOME, mcpAddCommand, mcpReplaceCommand } from '../app/utils/agentSetup'

const ORIGIN = 'https://tasks.example.com'

test('the replace command sets the key, removes the old server and adds it again', () => {
  const command = mcpReplaceCommand(ORIGIN, 'arn_test_key')
  const lines = command.split('\n')
  assert.equal(lines[0], exportKeyCommand('arn_test_key'))
  assert.equal(lines[1], 'claude mcp remove --scope user taskmanager 2>/dev/null')
  assert.ok(command.endsWith(mcpAddCommand(ORIGIN)), 'the add command comes last, unchanged')
})

test('the remove and the add are separate commands, so a failed remove does not stop the add', () => {
  const command = mcpReplaceCommand(ORIGIN)
  assert.doesNotMatch(command, /&&|\|\|/)
  assert.doesNotMatch(command, /;\s*claude mcp add/)
})

test('the replace command leaves the key out of the MCP entry and uses the variable instead', () => {
  const command = mcpReplaceCommand(ORIGIN, 'arn_test_key')
  assert.ok(command.includes('Authorization: Bearer ${TASKMANAGER_API_KEY}'))
  assert.equal(command.split('arn_test_key').length - 1, 1, 'the key appears only in the export line')
})

test('without a key the replace command still shows the placeholder export', () => {
  assert.ok(mcpReplaceCommand(ORIGIN).startsWith('export TASKMANAGER_API_KEY=arn_your_key_here\n'))
})

test('the profile note names the files for macOS and Linux and the app environment case', () => {
  assert.match(KEY_VARIABLE_HOME, /~\/\.zshrc/)
  assert.match(KEY_VARIABLE_HOME, /~\/\.bashrc/)
  assert.match(KEY_VARIABLE_HOME, /environment settings/)
})
