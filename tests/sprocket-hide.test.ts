// Hide-everything for Sprocket: no tool in a Sprocket run's list reads keys, tokens, passwords, sessions or the instance's
// OpenRouter key; the secret tools are refused by name; and an address the person may not see is taken out of every
// answer a Sprocket run gets. Needs the test database (the email rule reads it). Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes@localhost:55433/arnotes_test_wynn node --import tsx --test --test-force-exit tests/sprocket-hide.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'

Object.assign(globalThis, { createError })

const { hideForSprocket, sprocketRunToolSpecs } = await import('../server/utils/sprocketRun')
const { toolsForKey } = await import('../server/utils/mcpRegistry')

const everything = {
  keyId: 'sprocket-run:hide',
  keyName: 'Sprocket',
  userId: `hide-${randomBytes(4).toString('hex')}`,
  teamId: null,
  customerId: null,
  projectId: null,
  scopes: ['boards:read', 'boards:write', 'secrets:read', 'secrets:write', 'crews:manage'] as const,
  kind: 'access' as const,
  boardScopes: null,
  reach: { allBoards: true, workspaceTeamIds: [], boardIds: [] },
  memberTeamIds: [],
  sprocketRun: true
}

test('no tool in a Sprocket run reads keys, tokens, passwords, sessions or the OpenRouter key', () => {
  const names = sprocketRunToolSpecs(everything).map(spec => spec.function.name)
  // Words for what the server keeps about access. A tool name with one of them would be a tool that reads it.
  const forbidden = /key|token|password|session|secret|webhook|pair|openrouter|two_?factor|credential/i
  const offending = names.filter(name => forbidden.test(name) && name !== 'create_task')
  assert.deepEqual(offending, [], 'no offered tool name is about keys, secrets or sign-in data')
})

test('the tools the run is refused by name include every secret tool the registry has', () => {
  const offered = new Set(sprocketRunToolSpecs(everything).map(spec => spec.function.name))
  const everyTool = toolsForKey(everything).map(tool => tool.name)
  const secretTools = toolsForKey(everything).filter(tool => tool.name.includes('secret') || tool.name === 'get_project_env')
  assert.ok(secretTools.length >= 4)
  for (const tool of secretTools) assert.ok(!offered.has(tool.name), `${tool.name} is not offered`)
  assert.ok(everyTool.length > offered.size)
})

test('an address with no id beside it is taken out of the answer', async () => {
  const answer = await hideForSprocket({ assignee: { name: 'Pat', email: 'pat@example.test' } }, everything.userId)
  assert.equal('email' in (answer.assignee as Record<string, unknown>), false)
  assert.ok(!JSON.stringify(answer).includes('pat@example.test'))
})

test('an address the person may not see is masked wherever it sits in the answer', async () => {
  const answer = await hideForSprocket({
    board: { name: 'Launch' },
    people: [{ id: `other-${everything.userId}`, name: 'Other', email: 'other-secret@example.test' }],
    comments: [{ author: { id: `third-${everything.userId}`, email: 'third-secret@example.test' } }]
  }, everything.userId)
  const text = JSON.stringify(answer)
  assert.ok(!text.includes('other-secret@example.test'), 'a member address is not shown')
  assert.ok(!text.includes('third-secret@example.test'), 'an address nested in a comment is not shown')
  assert.match(text, /Launch/, 'the rest of the answer is kept')
})
