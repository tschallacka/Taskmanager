// Database side of browser verification: starting a request, what the approve page shows, the person's decision, and
// the poll that hands the token over once. The rules (codes, messages, narrowing, slow_down) are in deviceFlow.ts.
// Only digests of the device code and the user code are stored; the token is minted at the first approved poll.
import { createError } from 'h3'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { apiKeys, pairingDeviceRequests, user } from '../db/schema'
import type { ApiKeyScope } from '../db/schema'
import { scopesOfGrants } from './connectTokenRules'
import { storeBoardScopes } from './connectTokens'
import type { PairedToken } from './connectTokens'
import { deviceCodeDigest, deviceRefusal, DEVICE_POLL_INTERVAL_SECONDS, DEVICE_REQUEST_TTL_MS, generateDeviceCode, generateUserCode, isDeviceRequestExpired, isPollTooSoon, narrowGrant, slowDown, unknownDeviceCode, userCodeDigest } from './deviceFlow'
import type { RequestedBoard, StartRequest } from './deviceFlow'
import { issueKey } from './keyIssue'
import { openBoardsOf, workspacesOf } from './keyReach'
import { genId } from './projects'

type DeviceRequestRow = typeof pairingDeviceRequests.$inferSelect

/** Starts a request: a device code for the agent to poll with, and a user code for the person to approve. */
export async function startDeviceRequest(request: StartRequest, now = Date.now()) {
  const deviceCode = generateDeviceCode()
  const userCode = generateUserCode()
  const expiresAt = now + DEVICE_REQUEST_TTL_MS
  await db.insert(pairingDeviceRequests).values({
    id: genId(),
    deviceCodeHash: deviceCodeDigest(deviceCode)!,
    userCodeHash: userCodeDigest(userCode)!,
    clientName: request.clientName,
    requested: request.requested,
    status: 'pending',
    expiresAt,
    createdAt: now
  })
  return { deviceCode, userCode, expiresAt, interval: DEVICE_POLL_INTERVAL_SECONDS }
}

/** The request a user code names, if it can still be approved. Each refusal says why, for the person who asked. */
async function openRequestOf(userCode: unknown, now: number): Promise<DeviceRequestRow> {
  const digest = userCodeDigest(userCode)
  const [row] = digest
    ? await db.select().from(pairingDeviceRequests).where(eq(pairingDeviceRequests.userCodeHash, digest))
    : []
  if (!row) throw createError({ statusCode: 404, message: 'No connection request has that code. Check the code the agent showed you.' })
  if (row.status === 'denied') throw createError({ statusCode: 400, message: 'This connection request was already denied.' })
  if (row.status === 'approved') throw createError({ statusCode: 400, message: 'This connection request was already approved.' })
  if (isDeviceRequestExpired(row.expiresAt, now)) {
    throw createError({ statusCode: 400, message: 'This connection request has expired. Ask the agent to start a new one.' })
  }
  return row
}

/** Whether the person may give the instance-wide crew permission. */
async function isInstanceAdmin(userId: string): Promise<boolean> {
  const [row] = await db.select({ isInstanceAdmin: user.isInstanceAdmin }).from(user).where(eq(user.id, userId))
  return Boolean(row?.isInstanceAdmin)
}

/**
 * What the approve page shows: the client that asks, and each board it asks for with the permissions. A board the
 * person cannot open any more is shown as unavailable, and cannot be approved.
 */
export async function requestForApproval(userId: string, userCode: unknown, now = Date.now()) {
  const row = await openRequestOf(userCode, now)
  const [open, workspaces, admin] = await Promise.all([openBoardsOf(userId), workspacesOf(userId), isInstanceAdmin(userId)])
  const boards = new Map(open.map(board => [board.id, board]))
  const workspaceName = new Map(workspaces.map(workspace => [workspace.id, workspace.name]))
  return {
    clientName: row.clientName,
    expiresAt: row.expiresAt,
    canManageCrews: admin,
    boards: row.requested.map((asked: RequestedBoard) => {
      const board = boards.get(asked.boardId)
      return {
        boardId: asked.boardId,
        name: board?.name ?? null,
        workspace: board ? (board.teamId ? workspaceName.get(board.teamId) ?? 'Team' : 'Personal') : null,
        scopes: asked.scopes,
        available: Boolean(board)
      }
    })
  }
}

/**
 * The person's answer. Approving stores the grant they chose (never wider than the request, never a board they
 * cannot open now); denying ends the request. The token is not made here: the agent's next approved poll makes it.
 */
export async function decideDeviceRequest(userId: string, userCode: unknown, decision: unknown, chosen: unknown, now = Date.now()) {
  const row = await openRequestOf(userCode, now)
  if (decision === 'deny') {
    await db.update(pairingDeviceRequests)
      .set({ status: 'denied', approvedBy: userId })
      .where(and(eq(pairingDeviceRequests.id, row.id), eq(pairingDeviceRequests.status, 'pending')))
    return { ok: true, status: 'denied' as const }
  }
  if (decision !== 'approve') throw createError({ statusCode: 400, message: 'Pick approve or deny' })

  const grant = narrowGrant(row.requested, chosen)
  const open = new Set((await openBoardsOf(userId)).map(board => board.id))
  if (grant.some(board => !open.has(board.boardId))) throw createError({ statusCode: 400, message: 'A board is not one you can open' })
  if (grant.some(board => board.scopes.includes('crews:manage')) && !(await isInstanceAdmin(userId))) {
    throw createError({ statusCode: 403, message: 'Only the instance admin can give the manage crews permission' })
  }

  const [answered] = await db.update(pairingDeviceRequests)
    .set({ status: 'approved', approvedBy: userId, requested: grant })
    .where(and(eq(pairingDeviceRequests.id, row.id), eq(pairingDeviceRequests.status, 'pending')))
    .returning({ id: pairingDeviceRequests.id })
  if (!answered) throw createError({ statusCode: 400, message: 'This connection request was already answered.' })
  return { ok: true, status: 'approved' as const }
}

/**
 * The agent's poll. Pending until the person answers; denied and expired are refused; an approved request makes the
 * token once, for the person who approved it, with the boards it can still open. A poll sooner than the interval
 * is told to slow down. An unknown device code gets the plain 401.
 */
export async function pollDeviceRequest(deviceCode: unknown, now = Date.now()): Promise<{ status: 'pending', interval: number } | ({ status: 'approved' } & PairedToken)> {
  const digest = deviceCodeDigest(deviceCode)
  const [row] = digest ? await db.select().from(pairingDeviceRequests).where(eq(pairingDeviceRequests.deviceCodeHash, digest)) : []
  if (!row) throw unknownDeviceCode()

  const tooSoon = isPollTooSoon(row.lastPolledAt ?? null, now)
  await db.update(pairingDeviceRequests).set({ lastPolledAt: now }).where(eq(pairingDeviceRequests.id, row.id))
  if (tooSoon) throw slowDown()

  if (row.status === 'denied') throw deviceRefusal('device_denied')
  if (row.tokenId) throw deviceRefusal('device_consumed')
  if (isDeviceRequestExpired(row.expiresAt, now)) throw deviceRefusal('device_expired')
  if (row.status === 'pending') return { status: 'pending', interval: DEVICE_POLL_INTERVAL_SECONDS }
  return mintForApproval(row, now)
}

/**
 * Makes the token of an approved request, once. The grant is cut to what the approver can still open, and a crew
 * permission only while they are the instance admin. The claim on the request is what makes it once: a second
 * poll that wins the race gets device_consumed, and its token is removed.
 */
async function mintForApproval(row: DeviceRequestRow, now: number): Promise<{ status: 'approved' } & PairedToken> {
  const approver = row.approvedBy
  if (!approver) throw unknownDeviceCode()
  const open = new Map((await openBoardsOf(approver)).map(board => [board.id, board]))
  const grant = row.requested.filter(board => open.has(board.boardId))
  if (!grant.length) throw createError({ statusCode: 403, message: 'None of the boards of this connection can be opened by the person who approved it any more.' })
  if (grant.some(board => board.scopes.includes('crews:manage')) && !(await isInstanceAdmin(approver))) {
    throw createError({ statusCode: 403, message: 'The person who approved this connection may no longer give the manage crews permission.' })
  }

  const grants: Record<string, ApiKeyScope[]> = Object.fromEntries(grant.map(board => [board.boardId, board.scopes]))
  const { token, key } = await issueKey({
    userId: approver,
    teamId: null,
    request: { name: row.clientName, scopes: scopesOfGrants(grants), expiresAt: null },
    reach: { allBoards: false, workspaceTeamIds: [], boardIds: Object.keys(grants) }
  })

  const claimed = await db.transaction(async (tx) => {
    const claims = await tx.update(pairingDeviceRequests)
      .set({ tokenId: key.id })
      .where(and(eq(pairingDeviceRequests.id, row.id), isNull(pairingDeviceRequests.tokenId), eq(pairingDeviceRequests.status, 'approved')))
      .returning({ id: pairingDeviceRequests.id })
    if (!claims.length) return false
    await storeBoardScopes(tx, key.id, grants, now)
    return true
  })
  if (!claimed) {
    await db.delete(apiKeys).where(eq(apiKeys.id, key.id))
    throw deviceRefusal('device_consumed')
  }

  return {
    status: 'approved',
    token,
    keyPrefix: key.keyPrefix,
    name: key.name,
    scopes: scopesOfGrants(grants),
    allBoards: false,
    boards: grant.map(board => ({ id: board.boardId, name: open.get(board.boardId)!.name, scopes: board.scopes }))
  }
}
