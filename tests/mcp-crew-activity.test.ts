// crew_activity: the next cards a free worker may start, and the refusal for a board the key cannot
// reach. The refusal needs the dev database (DATABASE_URL); the ordering does not. Run:
//   DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/mcp-crew-activity.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { inArray } from 'drizzle-orm'
import type { OfficeTask } from '../shared/office/model'

// Nitro provides createError as a global; the snapshot helper expects it.
Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { member, organization, projects, user } = await import('../server/db/schema')
const { MCP_CREW_TOOLS, nextCardsFor } = await import('../server/utils/mcpCrewTools')
const { McpToolError } = await import('../server/utils/mcpToolKit')

function card(id: string, assigneeId: string | null, completed = false): OfficeTask {
  return { id, title: `Card ${id}`, stage: 'backlog', column: 'Backlog', assigneeId, completed, blocked: false, comments: 0 }
}

test('a worker gets their own backlog cards first, then unassigned ones, and the list is capped', () => {
  const backlog = [card('free1', null), card('mine1', 'u-wren'), card('other', 'u-wick'), card('free2', null), card('mine2', 'u-wren')]
  const next = nextCardsFor({ userId: 'u-wren' }, backlog, new Set(), 3)
  assert.deepEqual(next.map(c => [c.id, c.assignedToMe]), [['mine1', true], ['mine2', true], ['free1', false]])
})

test('blocked and finished cards are left out of what a worker may start', () => {
  const backlog = [card('blocked', null), card('done', 'u-wren', true), card('open', null)]
  const next = nextCardsFor({ userId: 'u-wren' }, backlog, new Set(['blocked']), 3)
  assert.deepEqual(next.map(c => c.id), ['open'])
})

const refusal = (pattern: RegExp) => (error: unknown) => error instanceof McpToolError && pattern.test(error.message)
const tag = randomBytes(4).toString('hex')
const id = (name: string) => `crew-${tag}-${name}`
const now = Date.now()
const me = id('me')
const other = id('other')
const teamA = id('team-a')
const teamB = id('team-b')
const boardB = id('board-b')

before(async () => {
  const at = new Date()
  await db.insert(user).values([me, other].map(u => ({ id: u, name: u, email: `${u}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })))
  await db.insert(organization).values([teamA, teamB].map(t => ({ id: t, name: `Team ${t.slice(-6)}`, slug: t, createdAt: at })))
  await db.insert(member).values([
    { id: id('m-a'), organizationId: teamA, userId: me, role: 'member', createdAt: at },
    { id: id('m-b'), organizationId: teamB, userId: other, role: 'owner', createdAt: at }
  ])
  await db.insert(projects).values({ id: boardB, userId: other, teamId: teamB, name: boardB.slice(-12), createdAt: now, updatedAt: now })
})

after(async () => {
  await db.delete(projects).where(inArray(projects.id, [boardB]))
  await db.delete(member).where(inArray(member.organizationId, [teamA, teamB]))
  await db.delete(organization).where(inArray(organization.id, [teamA, teamB]))
  await db.delete(user).where(inArray(user.id, [me, other]))
})

test('crew_activity refuses a board the key cannot reach, as get_board does', async () => {
  const tool = MCP_CREW_TOOLS.find(t => t.name === 'crew_activity')!
  assert.equal(tool.readOnly, true)
  assert.equal(tool.scope, 'boards:read')
  const context = { userId: me, teamId: teamA, scopes: ['boards:read'], customerId: null, projectId: null, readGrantedBoardIds: [] }
  await assert.rejects(
    tool.handler({ board: boardB }, context as never),
    refusal(/No board/)
  )
})
