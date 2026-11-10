// The Sprocket run key: a run acts as one person with the default MCP scopes and the person's reach, its tool list is the
// MCP list less every sensitive tool, a sensitive tool is refused by name, and a customer contact's run loses the
// workspace-wide tools. Needs the test database (teamIdsOf reads it). Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wynn node --import tsx --test --test-force-exit tests/sprocket-run.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'

Object.assign(globalThis, { createError })

const { sprocketRunContext, sprocketRunToolSpecs, runSprocketTool, SPROCKET_RUN_SCOPES } = await import('../server/utils/sprocketRun')
const { toolsForKey, WORKSPACE_WIDE_TOOLS } = await import('../server/utils/mcpRegistry')
const { McpToolError } = await import('../server/utils/mcpToolKit')

const SECRET_TOOLS = ['list_project_secrets', 'get_project_env', 'set_project_secrets', 'delete_project_secret']
const userId = `spr-${randomBytes(4).toString('hex')}`

test('a run acts as one person with the default MCP scopes and the whole reach', async () => {
  const run = await sprocketRunContext({ userId, teamId: null })
  assert.equal(run.userId, userId)
  assert.equal(run.keyName, 'Sprocket')
  assert.equal(run.sprocketRun, true)
  assert.deepEqual(run.scopes, [...SPROCKET_RUN_SCOPES])
  assert.deepEqual(run.scopes, ['boards:read', 'boards:write'])
  assert.equal(run.reach.allBoards, true)
  assert.equal(run.customerId, null)
})

test('the run has the MCP list less every sensitive tool', async () => {
  const run = await sprocketRunContext({ userId, teamId: null })
  const names = sprocketRunToolSpecs(run).map(spec => spec.function.name)
  for (const secret of SECRET_TOOLS) assert.ok(!names.includes(secret), `${secret} is not offered`)
  const expected = toolsForKey(run).filter(tool => !tool.sensitive).map(tool => tool.name)
  assert.deepEqual(names, expected)
  for (const name of ['search_help', 'read_help', 'get_task', 'search_tasks']) {
    assert.ok(names.includes(name), `${name} is offered`)
  }
})

test('a call to a secret tool by name is refused, and an unknown name is refused', async () => {
  const run = await sprocketRunContext({ userId, teamId: null })
  for (const secret of SECRET_TOOLS) {
    await assert.rejects(runSprocketTool(secret, {}, run), (e: unknown) => {
      assert.ok(e instanceof McpToolError)
      assert.match(e.message, /never given/)
      return true
    })
  }
  await assert.rejects(runSprocketTool('no_such_tool', {}, run), (e: unknown) => e instanceof McpToolError && /Unknown tool/.test(e.message))
})

test('a customer contact run loses the workspace-wide tools and keeps its customer', async () => {
  const run = await sprocketRunContext({ userId, teamId: `team-${userId}`, customerId: `cust-${userId}` })
  assert.equal(run.customerId, `cust-${userId}`)
  const names = new Set(sprocketRunToolSpecs(run).map(spec => spec.function.name))
  for (const wide of WORKSPACE_WIDE_TOOLS) assert.ok(!names.has(wide), `${wide} is not offered to a contact`)
  assert.ok(names.has('get_task'))
  for (const secret of SECRET_TOOLS) assert.ok(!names.has(secret))
})
