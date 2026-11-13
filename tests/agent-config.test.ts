// The per-agent config file (the main path, Boss's ruling on mwepy5fzg2i0jdvue7): one JSON file with one server entry,
// started with --mcp-config and --strict-mcp-config. No shared environment variable on the main path. Pure. Run:
//   node --import tsx --test tests/agent-config.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { agentConfigFileText, agentConfigStartCommand, SHARED_VARIABLE_LEGACY_LABEL, serverNameFor } from '../app/utils/agentConfig'

const ORIGIN = 'https://tm.example.test'
const TOKEN = 'arn_testtoken123'
const NAME = serverNameFor('Board A', 'Key 1')

test('the config file has one server entry, pointing at the board API, with the key in its header', () => {
  const config = JSON.parse(agentConfigFileText(ORIGIN, TOKEN, NAME))
  assert.deepEqual(Object.keys(config.mcpServers), [NAME], 'exactly one server, named for its key and board')
  const server = config.mcpServers[NAME]
  assert.equal(server.type, 'http')
  assert.equal(server.url, `${ORIGIN}/api/mcp`)
  assert.equal(server.headers.Authorization, `Bearer ${TOKEN}`)
})

test('the start command uses the file and nothing else for MCP: strict, one server', () => {
  assert.equal(agentConfigStartCommand('/home/me/agent-a.json'), 'claude --mcp-config /home/me/agent-a.json --strict-mcp-config')
})

test('the main path names no shared environment variable', () => {
  const text = agentConfigFileText(ORIGIN, TOKEN, NAME) + agentConfigStartCommand('/x.json')
  assert.doesNotMatch(text, /TASKMANAGER_API_KEY/)
})

test('the key panel offers the per-agent config file, with a unique server name, next to the legacy command', () => {
  const panel = readFileSync(new URL('../app/components/ApiKeysPanel.vue', import.meta.url), 'utf8')
  assert.match(panel, /'Copy agent config file'/)
  assert.match(panel, /agentConfigFileText\(window\.location\.origin, issuedToken\.value, issuedServerName\.value\)/)
  assert.match(panel, /serverNameFor\(boards, issuedName\.value, window\.location\.origin\)/)
  assert.match(panel, /claude --mcp-config &lt;file&gt; --strict-mcp-config/)
})

test('the shared variable is labelled legacy, and says why it breaks with several keys', () => {
  assert.match(SHARED_VARIABLE_LEGACY_LABEL, /legacy/i)
  assert.match(SHARED_VARIABLE_LEGACY_LABEL, /several keys/i)
})
