// Keys made before the board picker move their reach (one workspace or one board) into the reach tables,
// once. Needs the dev database with the reach tables pushed. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5433/arnotes node --import tsx --test tests/api-key-reach-migration.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'

const { db } = await import('../server/db')
const { apiKeys, apiKeyBoards, apiKeyWorkspaces, organization, projects, user } = await import('../server/db/schema')
const { migrateApiKeyReach } = await import('../server/utils/apiKeyReachMigration')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `akr-${tag}-${name}`
const now = Date.now()
const at = new Date()

const owner = id('owner')
const team = id('team')
const board = id('board')
const keys = {
  workspace: id('key-workspace'),
  personal: id('key-personal'),
  oneBoard: id('key-board'),
  alreadySet: id('key-set')
}

before(async () => {
  await db.insert(user).values({ id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at })
  await db.insert(organization).values({ id: team, name: 'Reach team', slug: team, createdAt: at })
  await db.insert(projects).values({ id: board, userId: owner, teamId: team, name: 'Reach board', createdAt: now, updatedAt: now })
  await db.insert(apiKeys).values([
    { id: keys.workspace, userId: owner, teamId: team, name: 'workspace', keyHash: id('hash-workspace'), keyPrefix: 'arn_', createdAt: now },
    { id: keys.personal, userId: owner, teamId: null, name: 'personal', keyHash: id('hash-personal'), keyPrefix: 'arn_', createdAt: now },
    { id: keys.oneBoard, userId: owner, teamId: team, projectId: board, name: 'one board', keyHash: id('hash-board'), keyPrefix: 'arn_', createdAt: now },
    // Already moved once and emptied by its owner: the migration must not refill it from its old columns.
    { id: keys.alreadySet, userId: owner, teamId: team, name: 'emptied', keyHash: id('hash-set'), keyPrefix: 'arn_', createdAt: now, boardReachSet: true }
  ])
})

after(async () => {
  await db.delete(apiKeys).where(inArray(apiKeys.id, Object.values(keys)))
  await db.delete(projects).where(eq(projects.id, board))
  await db.delete(user).where(eq(user.id, owner))
  await db.delete(organization).where(eq(organization.id, team))
  await db.$client.end()
})

test('a key limited to a workspace reaches that workspace, now and later', async () => {
  await migrateApiKeyReach()
  const rows = await db.select({ teamId: apiKeyWorkspaces.teamId }).from(apiKeyWorkspaces).where(eq(apiKeyWorkspaces.keyId, keys.workspace))
  assert.deepEqual(rows.map(row => row.teamId), [team])
})

test('a key made in the personal workspace reaches it through a NULL-team row', async () => {
  const rows = await db.select({ teamId: apiKeyWorkspaces.teamId }).from(apiKeyWorkspaces).where(eq(apiKeyWorkspaces.keyId, keys.personal))
  assert.deepEqual(rows.map(row => row.teamId), [null])
})

test('a key limited to one board reaches exactly that board and no workspace', async () => {
  const boards = await db.select({ projectId: apiKeyBoards.projectId }).from(apiKeyBoards).where(eq(apiKeyBoards.keyId, keys.oneBoard))
  assert.deepEqual(boards.map(row => row.projectId), [board])
  const workspaces = await db.select({ id: apiKeyWorkspaces.id }).from(apiKeyWorkspaces).where(eq(apiKeyWorkspaces.keyId, keys.oneBoard))
  assert.equal(workspaces.length, 0)
})

test('a key that was already moved is left as its owner emptied it', async () => {
  const [row] = await db.select({ set: apiKeys.boardReachSet }).from(apiKeys).where(eq(apiKeys.id, keys.alreadySet))
  assert.equal(row?.set, true)
  const rows = await db.select({ id: apiKeyWorkspaces.id }).from(apiKeyWorkspaces).where(eq(apiKeyWorkspaces.keyId, keys.alreadySet))
  assert.equal(rows.length, 0)
})

test('running it again moves no key', async () => {
  const again = await migrateApiKeyReach()
  assert.equal(again.keys, 0)
})
