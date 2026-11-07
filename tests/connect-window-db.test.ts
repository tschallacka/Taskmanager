// The window's own routes against the database: making a token with per-board permissions, listing it with its
// boards and who paired it, adding a board to an older token with the permissions copied, and changing the boards
// of a token. Needs the token tables (see connect-tokens.test.ts). Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5432/arnotes_test node --import tsx --test tests/connect-window-db.test.ts
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { and, eq, inArray } from 'drizzle-orm'
import type { H3Event } from 'h3'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { apiKeys, apiKeyBoardScopes, apiKeyBoards, apiKeySecrets, pairingCodes, projects, user } = await import('../server/db/schema')
const { createConnectToken, addBoardToConnectToken, editConnectToken, listConnectTokens } = await import('../server/utils/connectTokenWindow')
const { createPairingCode, redeemPairingCode } = await import('../server/utils/connectTokens')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `cwin-${tag}-${name}`
const at = new Date()
const now = Date.now()

const owner = id('owner')
const stranger = id('stranger')
const boardA = id('board-a')
const boardB = id('board-b')
const boardC = id('board-c')
const strangerBoard = id('board-stranger')
const event = {} as H3Event
const created: string[] = []

async function refusalOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error) {
    return (error as { message: string }).message
  }
  return 'no refusal'
}

async function tokenNamed(name: string) {
  const { tokens } = await listConnectTokens(owner)
  const token = tokens.find(row => row.name === name)
  assert.ok(token, `token ${name} is listed`)
  return token
}

before(async () => {
  await db.insert(user).values([
    { id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at },
    { id: stranger, name: stranger, email: `${stranger}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at }
  ])
  await db.insert(projects).values([
    { id: boardA, userId: owner, name: 'Office', createdAt: now, updatedAt: now },
    { id: boardB, userId: owner, name: 'Launch', createdAt: now, updatedAt: now },
    { id: boardC, userId: owner, name: 'Archive', createdAt: now, updatedAt: now },
    { id: strangerBoard, userId: stranger, name: 'Theirs', createdAt: now, updatedAt: now }
  ])
  created.push(boardA, boardB, boardC, strangerBoard)
})

after(async () => {
  const keys = (await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.userId, owner))).map(row => row.id)
  if (keys.length) {
    await db.delete(pairingCodes).where(inArray(pairingCodes.tokenId, keys))
    await db.delete(apiKeySecrets).where(inArray(apiKeySecrets.tokenId, keys))
    await db.delete(apiKeys).where(inArray(apiKeys.id, keys))
  }
  if (created.length) await db.delete(projects).where(inArray(projects.id, created))
  await db.delete(user).where(inArray(user.id, [owner, stranger]))
})

describe('making a token with per-board permissions', () => {
  test('the token reaches exactly the boards given, each with its permissions', async () => {
    const { key } = await createConnectToken(event, owner, {
      name: 'Laptop',
      expiresInDays: null,
      boards: [
        { projectId: boardA, scopes: ['boards:read', 'boards:write'] },
        { projectId: boardB, scopes: ['boards:read'] }
      ]
    })
    assert.ok(key.id)
    const row = await tokenNamed('Laptop')
    assert.deepEqual(row.scopes, ['boards:read', 'boards:write'])
    const byName = Object.fromEntries(row.boards.map(board => [board.name, board.scopes]))
    assert.deepEqual(byName, { Office: ['boards:read', 'boards:write'], Launch: ['boards:read'] })
    assert.equal(row.pairedBy, null)
  })

  test('a board the person cannot open is refused, and nothing is made', async () => {
    const message = await refusalOf(() => createConnectToken(event, owner, {
      name: 'Nope',
      expiresInDays: null,
      boards: [{ projectId: strangerBoard, scopes: ['boards:read'] }]
    }))
    assert.equal(message, 'A board is not one you can open')
    const { tokens } = await listConnectTokens(owner)
    assert.equal(tokens.some(row => row.name === 'Nope'), false)
  })
})

describe('adding a board to an older token', () => {
  test('copies the permissions of a board on the same token', async () => {
    const token = await tokenNamed('Laptop')
    await addBoardToConnectToken(event, owner, token.id, { projectId: boardC, copyFrom: { projectId: boardA } })
    const after = await tokenNamed('Laptop')
    const archive = after.boards.find(board => board.name === 'Archive')
    assert.deepEqual(archive?.scopes, ['boards:read', 'boards:write'])
    assert.equal(after.boards.length, 3)
  })

  test('a board already on the token is refused, and the permissions stay as they were', async () => {
    const token = await tokenNamed('Laptop')
    const message = await refusalOf(() => addBoardToConnectToken(event, owner, token.id, { projectId: boardB, scopes: ['boards:write'] }))
    assert.match(message, /already on this token/)
    const after = await tokenNamed('Laptop')
    assert.deepEqual(after.boards.find(board => board.name === 'Launch')?.scopes, ['boards:read'])
  })

  test('copies the permissions from a board of another token the person owns', async () => {
    const { key } = await createConnectToken(event, owner, {
      name: 'Phone',
      expiresInDays: 30,
      boards: [{ projectId: boardB, scopes: ['boards:read'] }]
    })
    const phone = await tokenNamed('Phone')
    assert.ok(phone.expiresAt && phone.expiresAt > now)
    const laptop = await tokenNamed('Laptop')
    await addBoardToConnectToken(event, owner, key.id, {
      projectId: boardA,
      copyFrom: { tokenId: laptop.id, projectId: boardA }
    })
    const after = await tokenNamed('Phone')
    assert.deepEqual(after.boards.find(board => board.name === 'Office')?.scopes, ['boards:read', 'boards:write'])
    assert.deepEqual(after.scopes, ['boards:read', 'boards:write'])
  })

  test('a copy from a board the source token does not have is refused', async () => {
    const laptop = await tokenNamed('Laptop')
    const phone = await tokenNamed('Phone')
    // The Phone connection has no permissions on the Archive board, so there is nothing to copy from it.
    const message = await refusalOf(() => addBoardToConnectToken(event, owner, phone.id, {
      projectId: boardC,
      copyFrom: { projectId: boardC }
    }))
    assert.match(message, /no permissions on the board to copy/)
    const fromOther = await refusalOf(() => addBoardToConnectToken(event, owner, phone.id, {
      projectId: boardC,
      copyFrom: { tokenId: laptop.id, projectId: boardC }
    }))
    assert.equal(fromOther, 'no refusal')
    await editConnectToken(event, owner, phone.id, { boards: [{ projectId: boardA, scopes: ['boards:read'] }, { projectId: boardB, scopes: ['boards:read'] }] })
    assert.match(message, /no permissions on the board to copy/)
  })
})

describe('changing the boards of a token', () => {
  test('replaces the permissions, and a board left out comes off the token', async () => {
    const token = await tokenNamed('Laptop')
    await editConnectToken(event, owner, token.id, {
      name: 'Laptop at work',
      boards: [
        { projectId: boardA, scopes: ['boards:read'] },
        { projectId: boardB, scopes: ['boards:read', 'boards:write'] }
      ]
    })
    const after = await tokenNamed('Laptop at work')
    assert.deepEqual(after.boards.map(board => board.name).sort(), ['Launch', 'Office'])
    assert.deepEqual(after.boards.find(board => board.name === 'Office')?.scopes, ['boards:read'])
    assert.deepEqual(after.scopes, ['boards:read', 'boards:write'])
  })

  test('the key stays the same when its boards change', async () => {
    const token = await tokenNamed('Laptop at work')
    const [before] = await db.select({ keyHash: apiKeys.keyHash }).from(apiKeys).where(eq(apiKeys.id, token.id))
    await editConnectToken(event, owner, token.id, { boards: [{ projectId: boardA, scopes: ['boards:read'] }] })
    const [afterRow] = await db.select({ keyHash: apiKeys.keyHash }).from(apiKeys).where(eq(apiKeys.id, token.id))
    assert.ok(before?.keyHash)
    assert.equal(afterRow?.keyHash, before?.keyHash)
  })

  test('a pairing code exchanged after the change hands over the boards as they now are', async () => {
    const token = await tokenNamed('Laptop at work')
    const { code } = await createPairingCode(owner, token.id)
    const paired = await redeemPairingCode(code, 'test client')
    assert.deepEqual(paired.boards.map(board => board.name), ['Office'])
    assert.equal((await tokenNamed('Laptop at work')).pairedBy?.usedFrom, 'test client')
  })

  test('a board the person cannot open cannot be put on a token by editing it', async () => {
    const token = await tokenNamed('Phone')
    const message = await refusalOf(() => editConnectToken(event, owner, token.id, {
      boards: [{ projectId: strangerBoard, scopes: ['boards:read'] }]
    }))
    assert.equal(message, 'A board is not one you can open')
  })

  test('a token the person does not own is a 404', async () => {
    const token = await tokenNamed('Phone')
    const otherOwner = await refusalOf(() => editConnectToken(event, stranger, token.id, {
      boards: [{ projectId: boardA, scopes: ['boards:read'] }]
    }))
    assert.equal(otherOwner, 'API key not found')
  })
})

test('the reach rows of a token match its granted boards', async () => {
  const token = await tokenNamed('Laptop at work')
  const reach = await db.select({ projectId: apiKeyBoards.projectId }).from(apiKeyBoards).where(eq(apiKeyBoards.keyId, token.id))
  const grants = await db.select({ projectId: apiKeyBoardScopes.projectId }).from(apiKeyBoardScopes)
    .where(and(eq(apiKeyBoardScopes.keyId, token.id)))
  assert.deepEqual([...new Set(reach.map(row => row.projectId))].sort(), [...new Set(grants.map(row => row.projectId))].sort())
})
