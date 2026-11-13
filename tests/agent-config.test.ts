// The per-agent config file (the main path, Boss's ruling on mwepy5fzg2i0jdvue7): one JSON file with one server entry,
// started with --mcp-config and --strict-mcp-config, and the single-person local add. No shared environment variable on
// the main path. Pure. Run:
//   node --import tsx --test tests/agent-config.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { agentConfigFileText, agentConfigStartCommand, localAddCommand, SHARED_VARIABLE_LEGACY_LABEL } from '../app/utils/agentConfig'

const ORIGIN = 'https://tm.example.test'
const TOKEN = 'arn_testtoken123'

test('the config file has one server entry, pointing at the board API, with the key in its header', () => {
  const config = JSON.parse(agentConfigFileText(ORIGIN, TOKEN, 'taskmanager'))
  assert.deepEqual(Object.keys(config.mcpServers), ['taskmanager'], 'exactly one server')
  const server = config.mcpServers.taskmanager
  assert.equal(server.type, 'http')
  assert.equal(server.url, `${ORIGIN}/api/mcp`)
  assert.equal(server.headers.Authorization, `Bearer ${TOKEN}`)
})

test('the start command uses the file and nothing else for MCP: strict, one server', () => {
  assert.equal(agentConfigStartCommand('/home/me/agent-a.json'), 'claude --mcp-config /home/me/agent-a.json --strict-mcp-config')
})

test('the main path names no shared environment variable', () => {
  const text = agentConfigFileText(ORIGIN, TOKEN, 'taskmanager') + agentConfigStartCommand('/x.json')
  assert.doesNotMatch(text, /TASKMANAGER_API_KEY/)
})

test('the key panel offers the per-agent config file as its copy button, next to the legacy command', () => {
  const panel = readFileSync(new URL('../app/components/ApiKeysPanel.vue', import.meta.url), 'utf8')
  assert.match(panel, /label="Copy agent config file"|'Copy agent config file'/)
  assert.match(panel, /agentConfigFileText\(window\.location\.origin, issuedToken\.value\)/)
  assert.match(panel, /claude --mcp-config &lt;file&gt; --strict-mcp-config/)
})

test('the single-person option is a folder-local add, and the shared variable is labelled legacy', () => {
  assert.equal(localAddCommand(ORIGIN, TOKEN), `claude mcp add --scope local --transport http taskmanager ${ORIGIN}/api/mcp --header 'Authorization: Bearer ${TOKEN}'`)
  assert.match(SHARED_VARIABLE_LEGACY_LABEL, /legacy/i)
})
