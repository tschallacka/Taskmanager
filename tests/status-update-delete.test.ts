// An agent takes back its own board status update (card mw9pfqe6sg32is2nvv): delete_status_update removes one update by id,
// for its author only, and post_status_update refuses an empty body. The decisions are checked here without a database;
// the route's own rule is server/api/projects/[id]/status-updates/[updateId].delete.ts. Run with the Nuxt server path aliases:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json node --import tsx --test tests/status-update-delete.test.ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MCP_STATUS_TOOLS, requireStatusAuthor, requireStatusBody } from '../server/utils/mcpStatusTools'
import { McpToolError } from '../server/utils/mcpToolKit'
import type { McpToolDefinition } from '../server/utils/mcpToolKit'

function toolNamed(name: string): McpToolDefinition {
  const tool = MCP_STATUS_TOOLS.find(candidate => candidate.name === name)
  assert.ok(tool, `${name} is registered`)
  return tool
}

function refusal(action: () => unknown): string {
  try {
    action()
  } catch (error) {
    assert.ok(error instanceof McpToolError, 'a refusal the model can read')
    return error.message
  }
  throw new Error('expected a refusal')
}

describe('delete_status_update', () => {
  test('is a board write that removes one update by its id, and says so', () => {
    const tool = toolNamed('delete_status_update')
    assert.equal(tool.scope, 'boards:write')
    assert.equal(tool.readOnly, false)
    assert.equal(tool.destructive, true)
    assert.deepEqual(tool.inputSchema.required, ['board', 'updateId'])
    assert.match(tool.description, /own/i, 'the description says it is the agent\'s own update')
  })

  test('the author may delete; another key owner is refused in one sentence', () => {
    requireStatusAuthor({ userId: 'key-owner-1' }, { userId: 'key-owner-1' })
    const message = refusal(() => requireStatusAuthor({ userId: 'key-owner-1' }, { userId: 'key-owner-2' }))
    assert.equal(message, 'Only the author can delete this status update: it was written by someone else.')
    assert.equal((message.match(/[.!?]/g) ?? []).length, 1, 'one sentence')
  })

  test('an update id that is not on the board is refused the same way a missing one is', () => {
    assert.equal(refusal(() => requireStatusAuthor(undefined, { userId: 'key-owner-1' })), 'No status update with that id on this board.')
  })
})

describe('post_status_update refuses an empty body', () => {
  test('a missing or blank body is refused, and nothing is posted', () => {
    assert.match(refusal(() => requireStatusBody({})), /empty/)
    assert.match(refusal(() => requireStatusBody({ body: '   ' })), /empty/)
  })

  test('a body with words is kept, trimmed', () => {
    assert.equal(requireStatusBody({ body: '  Shipped the reports.  ' }), 'Shipped the reports.')
  })

  test('the post tool carries the body as required', () => {
    assert.deepEqual(toolNamed('post_status_update').inputSchema.required, ['board', 'status', 'body'])
  })
})

test('the MCP tools page lists delete_status_update', () => {
  const docs = readFileSync(new URL('../docs/agents/tools-overview.md', import.meta.url), 'utf8')
  assert.match(docs, /`delete_status_update`/)
})
