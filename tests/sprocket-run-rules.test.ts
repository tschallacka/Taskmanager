// Sprocket's rules on the server, without a database: the manner block follows the person's pick and falls back to the
// site default, the fixed rules are in every manner, and a Sprocket run is given the MCP list minus every sensitive
// tool and refused a sensitive tool by name. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test --test-force-exit tests/sprocket-run-rules.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { CHAT_SYSTEM_PROMPT } = await import('../server/utils/chatTools')
const { MANNER_TABLE, SPROCKET_MANNERS, mannerBlock, promptWithManner, resolveManner } = await import('../server/utils/sprocketManner')
const { sprocketRefusal, toolsForKey, toolsForSprocket, MCP_TOOLS } = await import('../server/utils/mcpRegistry')

const everything = {
  scopes: ['boards:read', 'boards:write', 'secrets:read', 'secrets:write', 'crews:manage'] as const,
  customerId: null,
  reach: { allBoards: true, workspaceTeamIds: [], boardIds: [] }
}
const SECRET_TOOLS = ['list_project_secrets', 'get_project_env', 'set_project_secrets', 'delete_project_secret']

test('the person\'s own manner wins over the site default', () => {
  assert.equal(resolveManner('teacher', 'professional'), 'teacher')
  assert.equal(resolveManner('playful', 'concise'), 'playful')
})

test('without a pick the site default answers, and Professional when nothing is set', () => {
  assert.equal(resolveManner(null, 'friendly'), 'friendly')
  assert.equal(resolveManner(undefined, undefined), 'professional')
  assert.equal(resolveManner('not-a-manner', 'concise'), 'concise')
})

test('the manner block in the prompt follows the pick', () => {
  const professional = promptWithManner(CHAT_SYSTEM_PROMPT, 'professional')
  const playful = promptWithManner(CHAT_SYSTEM_PROMPT, 'playful')
  assert.ok(professional.includes(MANNER_TABLE.professional.block))
  assert.ok(!professional.includes(MANNER_TABLE.playful.block))
  assert.ok(playful.includes(MANNER_TABLE.playful.block))
  assert.notEqual(professional, playful)
})

test('the fixed rules are in the prompt for every manner', () => {
  const rule = 'delete_task only moves a task to the trash'
  assert.ok(CHAT_SYSTEM_PROMPT.includes(rule))
  for (const manner of SPROCKET_MANNERS) {
    const prompt = promptWithManner(CHAT_SYSTEM_PROMPT, manner)
    assert.ok(prompt.includes(rule), `${manner} keeps the rules`)
    assert.ok(prompt.includes('the rules above still hold'), `${manner} says the rules still hold`)
    assert.ok(prompt.includes(mannerBlock(manner)))
  }
})

test('every manner has a label and a sample for the picker', () => {
  for (const manner of SPROCKET_MANNERS) {
    assert.ok(MANNER_TABLE[manner].label.length > 0)
    assert.ok(MANNER_TABLE[manner].sample.length > 0)
  }
  assert.equal(SPROCKET_MANNERS.length, 5)
})

test('a Sprocket run gets no sensitive tool, and the MCP list otherwise', () => {
  const sprocket = new Set(toolsForSprocket(everything).map(tool => tool.name))
  for (const name of SECRET_TOOLS) assert.ok(!sprocket.has(name), `${name} is not in the Sprocket list`)
  const expected = toolsForKey(everything).filter(tool => !tool.sensitive).map(tool => tool.name)
  assert.deepEqual([...sprocket], expected)
  assert.ok(sprocket.has('search_help') && sprocket.has('read_help'), 'help search and read reach Sprocket')
})

test('every secret-reading tool is marked sensitive in the registry', () => {
  for (const name of SECRET_TOOLS) {
    const tool = MCP_TOOLS.find(candidate => candidate.name === name)
    assert.ok(tool, `${name} exists`)
    assert.equal(tool.sensitive, true, `${name} is marked sensitive`)
  }
})

test('a Sprocket run calling a sensitive tool by name is refused; other callers and tools are not', () => {
  const tool = MCP_TOOLS.find(candidate => candidate.name === 'get_project_env')!
  assert.ok(sprocketRefusal(tool, { sprocketRun: true }))
  assert.equal(sprocketRefusal(tool, { sprocketRun: false }), null)
  assert.equal(sprocketRefusal(tool, {}), null)
  const plain = MCP_TOOLS.find(candidate => candidate.name === 'get_task')!
  assert.equal(sprocketRefusal(plain, { sprocketRun: true }), null)
})
