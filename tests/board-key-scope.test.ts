// A token with per-board grants (the "Connect your Claude to this board" kind) reaches only the boards that grant
// the permission of the call being made. The MCP dispatch sets that permission per tool; a route that takes the
// key over plain HTTP (the board backup and the board import) must set it with forCall, or the token reaches no
// board and every board answers 404. Needs the dev database.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { inArray } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const schema = await import('../server/db/schema')
const { forCall } = await import('../server/utils/api-keys')
const { boardFilter } = await import('../server/utils/mcpAccess')
const { member, organization, projects, user } = schema
type Context = Parameters<typeof boardFilter>[0]

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `bks-${tag}-${name}`
const now = Date.now()
const at = new Date()
const owner = id('owner')
const team = id('team')
const readBoard = id('read-board')
const writeBoard = id('write-board')
const otherBoard = id('other-board')

before(async () => {
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@arnotes.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values({ id: team, name: team, slug: team, createdAt: at })
  await db.insert(member).values({ id: id('m'), organizationId: team, userId: owner, role: 'owner', createdAt: at })
  await db.insert(projects).values([readBoard, writeBoard, otherBoard].map(boardId => ({
    id: boardId, userId: owner, teamId: team, name: boardId, createdAt: now, updatedAt: now
  })))
})

after(async () => {
  await db.delete(projects).where(inArray(projects.id, [readBoard, writeBoard, otherBoard]))
  await db.delete(organization).where(inArray(organization.id, [team]))
  await db.delete(user).where(inArray(user.id, [owner]))
  await db.$client.end()
})

/** A token that may read one board and change another, and holds no grant on the third. */
function perBoardToken(): Context {
  return {
    keyId: id('key'),
    keyName: 'Junkbox',
    userId: owner,
    teamId: team,
    customerId: null,
    projectId: null,
    scopes: ['boards:read', 'boards:write'],
    kind: 'access',
    boardScopes: { [readBoard]: ['boards:read'], [writeBoard]: ['boards:write'] },
    reach: { allBoards: true, workspaceTeamIds: [], boardIds: [] },
    memberTeamIds: [team]
  }
}

async function reached(context: Context): Promise<string[]> {
  const rows = await db.select({ id: projects.id }).from(projects).where(await boardFilter(context))
  return rows.map(row => row.id).filter(boardId => [readBoard, writeBoard, otherBoard].includes(boardId)).sort()
}

test('without the permission of the call, a per-board token reaches no board (the 404 the routes gave)', async () => {
  assert.deepEqual(await reached(perBoardToken()), [])
})

test('a read call reaches the board that grants read, and only that one', async () => {
  assert.deepEqual(await reached(forCall(perBoardToken(), 'boards:read')), [readBoard])
})

test('a write call reaches the board that grants write, and only that one', async () => {
  assert.deepEqual(await reached(forCall(perBoardToken(), 'boards:write')), [writeBoard])
})

test('a token without per-board grants is unchanged by forCall', async () => {
  const plain: Context = { ...perBoardToken(), boardScopes: null }
  const all = [otherBoard, readBoard, writeBoard].sort()
  assert.deepEqual(await reached(plain), all)
  assert.deepEqual(await reached(forCall(plain, 'boards:read')), all)
})
