// Browser verification against the database: a request is started, the person approves or denies it, and the agent
// polls until the token comes once. Needs the dev database with pairing_device_requests pushed. Run:
//   TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json DATABASE_URL=postgresql://arnotes:arnotes@localhost:5432/arnotes_test node --import tsx --test tests/pairing-device.test.ts
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { eq, inArray, like } from 'drizzle-orm'

Object.assign(globalThis, { createError })

const { db } = await import('../server/db')
const { apiKeys, apiKeyBoardScopes, pairingDeviceRequests, projects, user } = await import('../server/db/schema')
const { startDeviceRequest, requestForApproval, decideDeviceRequest, pollDeviceRequest } = await import('../server/utils/deviceFlowDb')
const { DEVICE_POLL_INTERVAL_SECONDS, DEVICE_REQUEST_TTL_MS } = await import('../server/utils/deviceFlow')

const tag = randomBytes(4).toString('hex')
const id = (name: string) => `device-${tag}-${name}`
const now = Date.now()
const at = new Date()

const owner = id('owner')
const stranger = id('stranger')
const boardA = id('boardA')
const boardB = id('boardB')
const otherBoard = id('someone-elses')
const clientName = `scratch: ${tag} laptop`

const requested = [
  { boardId: boardA, scopes: ['boards:read', 'boards:write'] },
  { boardId: boardB, scopes: ['boards:read'] }
]

/** The error a promise rejects with, or fails the test when it does not reject. */
async function refusalOf(promise: Promise<unknown>): Promise<{ statusCode: number, message: string, data?: { code?: string, interval?: number } }> {
  try {
    await promise
  } catch (error) {
    return error as { statusCode: number, message: string, data?: { code?: string, interval?: number } }
  }
  assert.fail('expected a refusal')
}

before(async () => {
  await db.insert(user).values([
    { id: owner, name: owner, email: `${owner}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at },
    { id: stranger, name: stranger, email: `${stranger}@staff.test`, emailVerified: true, createdAt: at, updatedAt: at }
  ])
  await db.insert(projects).values([boardA, boardB].map(boardId => ({ id: boardId, userId: owner, name: `scratch: ${boardId}`, createdAt: now, updatedAt: now })))
  await db.insert(projects).values({ id: otherBoard, userId: stranger, name: `scratch: ${otherBoard}`, createdAt: now, updatedAt: now })
})

after(async () => {
  await db.delete(pairingDeviceRequests).where(like(pairingDeviceRequests.clientName, `scratch: ${tag}%`))
  await db.delete(projects).where(inArray(projects.id, [boardA, boardB, otherBoard]))
  await db.delete(user).where(inArray(user.id, [owner, stranger]))
})

test('a started request keeps only digests, and the approve page lists what it asks for', async () => {
  const started = await startDeviceRequest({ clientName, requested: requested as never }, now)
  assert.equal(started.interval, DEVICE_POLL_INTERVAL_SECONDS)
  assert.equal(started.expiresAt, now + DEVICE_REQUEST_TTL_MS)
  const [row] = await db.select().from(pairingDeviceRequests).where(eq(pairingDeviceRequests.clientName, clientName))
  assert.ok(row)
  assert.ok(!JSON.stringify(row).includes(started.deviceCode), 'the device code is not stored')
  assert.ok(!JSON.stringify(row).includes(started.userCode), 'the user code is not stored')

  const view = await requestForApproval(owner, started.userCode, now)
  assert.equal(view.clientName, clientName)
  assert.equal(view.boards.find(board => board.boardId === boardA)?.available, true)
})

test('a board the person cannot open shows as unavailable on the approve page', async () => {
  const started = await startDeviceRequest({ clientName, requested: [{ boardId: otherBoard, scopes: ['boards:read'] }] as never }, now)
  const view = await requestForApproval(owner, started.userCode, now)
  assert.equal(view.boards[0]!.available, false)
})

test('approving keeps only what the person picked, and a widened pick is refused', async () => {
  const started = await startDeviceRequest({ clientName, requested: requested as never }, now)
  const widened = await refusalOf(decideDeviceRequest(owner, started.userCode, 'approve', [{ boardId: boardA, scopes: ['secrets:write'] }], now))
  assert.match(widened.message, /did not ask for one of the permissions/)

  await decideDeviceRequest(owner, started.userCode, 'approve', [{ boardId: boardA, scopes: ['boards:read'] }], now)
  const [row] = await db.select().from(pairingDeviceRequests).where(eq(pairingDeviceRequests.clientName, clientName)).orderBy(pairingDeviceRequests.createdAt)
  assert.ok(row)
})

test('a poll before the answer is pending, and a poll too soon after it is told to slow down', async () => {
  const started = await startDeviceRequest({ clientName, requested: requested as never }, now)
  const pending = await pollDeviceRequest(started.deviceCode, now)
  assert.deepEqual(pending, { status: 'pending', interval: DEVICE_POLL_INTERVAL_SECONDS })
  const slow = await refusalOf(pollDeviceRequest(started.deviceCode, now + 1000))
  assert.equal(slow.statusCode, 429)
  assert.equal(slow.data?.code, 'slow_down')
})

test('a denied request is refused to the agent with the message for the user', async () => {
  const started = await startDeviceRequest({ clientName, requested: requested as never }, now)
  await decideDeviceRequest(owner, started.userCode, 'deny', undefined, now)
  const refusal = await refusalOf(pollDeviceRequest(started.deviceCode, now + 10_000))
  assert.equal(refusal.statusCode, 401)
  assert.equal(refusal.data?.code, 'device_denied')
  assert.match(refusal.message, /do not start it again/)
})

test('a request past its expiry is refused as expired', async () => {
  const started = await startDeviceRequest({ clientName, requested: requested as never }, now)
  const refusal = await refusalOf(pollDeviceRequest(started.deviceCode, started.expiresAt + 1))
  assert.equal(refusal.data?.code, 'device_expired')
})

test('an approved request hands over its token once, with the narrowed grant, and then refuses', async () => {
  const started = await startDeviceRequest({ clientName, requested: requested as never }, now)
  await decideDeviceRequest(owner, started.userCode, 'approve', [{ boardId: boardA, scopes: ['boards:read'] }, { boardId: boardB, scopes: ['boards:read'] }], now)

  const approved = await pollDeviceRequest(started.deviceCode, now + 10_000)
  assert.equal(approved.status, 'approved')
  if (approved.status !== 'approved') return
  assert.match(approved.token, /^arn_/)
  assert.equal(approved.name, clientName)
  const grant = Object.fromEntries(approved.boards.map(board => [board.id, board.scopes]))
  assert.deepEqual(grant, { [boardA]: ['boards:read'], [boardB]: ['boards:read'] })

  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.name, clientName))
  assert.ok(key)
  assert.equal(key!.userId, owner)
  const scopes = await db.select().from(apiKeyBoardScopes).where(eq(apiKeyBoardScopes.keyId, key!.id))
  assert.equal(scopes.length, 2)

  const again = await refusalOf(pollDeviceRequest(started.deviceCode, now + 30_000))
  assert.equal(again.data?.code, 'device_consumed')
  await db.delete(apiKeys).where(eq(apiKeys.id, key!.id))
})

test('a board the approver lost access to is dropped at the poll, and no board left refuses', async () => {
  const started = await startDeviceRequest({ clientName, requested: requested as never }, now)
  await decideDeviceRequest(owner, started.userCode, 'approve', [{ boardId: boardA, scopes: ['boards:read'] }], now)
  await db.update(projects).set({ userId: stranger }).where(eq(projects.id, boardA))
  const refusal = await refusalOf(pollDeviceRequest(started.deviceCode, now + 10_000))
  assert.equal(refusal.statusCode, 403)
  await db.update(projects).set({ userId: owner }).where(eq(projects.id, boardA))
})

test('an unknown device code gets the plain 401', async () => {
  const refusal = await refusalOf(pollDeviceRequest(randomBytes(32).toString('base64url'), now))
  assert.equal(refusal.statusCode, 401)
  assert.equal(refusal.message, 'Invalid device code')
  assert.equal(refusal.data, undefined)
})
