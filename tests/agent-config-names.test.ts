// Unique server names and the project folder form (owner, 2026-11-13, on mwepy5fzg2i0jdvue7). Two keys on two boards
// never share a server name; no generated text uses the bare name `taskmanager`; the folder form is project scope
// (.mcp.json), mode 600, excluded from git, and not committed; no generated text writes user scope or a profile.
// Pure. Run:
//   node --import tsx --test tests/agent-config-names.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agentConfigFileText, projectAddCommand, projectMcpJson, projectSetupText, serverNameFor } from '../app/utils/agentConfig'

const ORIGIN = 'https://tm.example.test'

test('the same person on two origins (a local dev app and the live app) gets two different server names', () => {
  const local = serverNameFor('Seed board', 'Wynn key', 'http://taskmanager.localhost')
  const live = serverNameFor('Seed board', 'Wynn key', 'https://taskmanager.tschallacka.dev')
  assert.notEqual(local, live, 'same board and key label, two origins: two names')
  assert.doesNotMatch(local, /taskmanager\.localhost|\./, 'the name is a plain slug, no dots')
})

test('the server name is unique per board and key, never the bare name', () => {
  assert.equal(serverNameFor('Seed real board', 'Wynn laptop', ORIGIN), 'taskmanager-tm-example-test-seed-real-board-wynn-laptop')
  assert.notEqual(serverNameFor('Board A', 'Key 1'), 'taskmanager')
  assert.notEqual(serverNameFor('Board A', 'Key 1'), serverNameFor('Board B', 'Key 1'), 'two boards give two names')
  assert.notEqual(serverNameFor('Board A', 'Key 1'), serverNameFor('Board A', 'Key 2'), 'two keys give two names')
  assert.match(serverNameFor('', ''), /^taskmanager-[a-z0-9-]+$/, 'an empty label still gives a valid name')
})

test('two keys on two boards give two different project files, and neither contains the other key', () => {
  const a = projectMcpJson(ORIGIN, 'arn_keyAAAA1111', serverNameFor('Board A', 'Key 1'))
  const b = projectMcpJson(ORIGIN, 'arn_keyBBBB2222', serverNameFor('Board B', 'Key 2'))
  assert.notEqual(a, b)
  assert.doesNotMatch(a, /arn_keyBBBB2222/)
  assert.doesNotMatch(b, /arn_keyAAAA1111/)
})

test('the file never uses the bare name as its server key', () => {
  const text = agentConfigFileText(ORIGIN, 'arn_x', serverNameFor('Board A', 'Key 1'))
  const config = JSON.parse(text)
  assert.deepEqual(Object.keys(config.mcpServers), ['taskmanager-board-a-key-1'])
  assert.doesNotMatch(text, /"taskmanager":/)
})

test('the project folder form always carries the git exclude step and the do-not-commit rule', () => {
  const text = projectSetupText(ORIGIN, 'arn_x', serverNameFor('Board A', 'Key 1'))
  assert.match(text, /\.mcp\.json/)
  assert.match(text, /\.git\/info\/exclude/, 'the exclude step is always there')
  assert.match(text, /do not commit/i)
  assert.match(text, /approve/i, 'Claude Code asks to approve a project server on first start')
})

test('no generated text writes to user scope or to the shell profile', () => {
  const text = projectSetupText(ORIGIN, 'arn_x', serverNameFor('Board A', 'Key 1')) + projectAddCommand(ORIGIN, 'arn_x', serverNameFor('Board A', 'Key 1'))
  assert.doesNotMatch(text, /mcp add --scope user/, 'nothing is added to user scope')
  assert.doesNotMatch(text, /\.zshrc|\.bashrc|\.profile/, 'nothing goes into a profile')
  assert.doesNotMatch(text, /\$\{TASKMANAGER/, 'no shared variable')
})

test('the project add names the server and the project scope', () => {
  assert.equal(
    projectAddCommand(ORIGIN, 'arn_x', 'taskmanager-board-a-key-1'),
    `claude mcp add --scope project --transport http taskmanager-board-a-key-1 ${ORIGIN}/api/mcp --header 'Authorization: Bearer arn_x'`
  )
})
