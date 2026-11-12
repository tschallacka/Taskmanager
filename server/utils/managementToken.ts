// The 10-minute management token: the crew token a person makes from the sidebar ("Get AI management token").
// It is an API key of kind 'management' bound to ONE board: its team, and crews:manage on that board only.
// It expires after 10 minutes (expires_at, refused by authenticateApiKey with token_expired), and it never has
// more rights than its owner has now: the crew permission and the owner-or-admin role of the board's team are
// checked when it is made and again on every crew call (requireCrewManager and the crew gate).
import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { db } from '../db'
import { agentAudit, apiKeys, crewBoards, crews, member, projects } from '../db/schema'
import type { Crew } from '../db/schema'
import { generateApiKey } from './api-keys'
import { storeBoardScopes } from './connectTokens'
import { isCrewUser } from './crewAccounts'
import { boardToBind } from './crewBoards'
import { crewPermissionRefusal, isInstanceAdmin } from './crewPermission'
import { chargeRateLimit, limitsFor, scopeOfBoard } from './rateLimits'
import type { CrewCaller } from './crewProvisioning'
import { storeReach } from './keyReach'
import { genId } from './projects'

export const MANAGEMENT_TOKEN_MS = 10 * 60_000
export const MANAGEMENT_SCOPE = 'crews:manage'
export const CREATE_NEEDS_TOKEN = 'Making a crew, or binding one to a board, needs a management token from the board\'s sidebar.'
export const DELETE_NEEDS_TOKEN = 'Deleting a crew needs a management token from its board.'

/**
 * Makes the management token for one board. The board must be one the person may bind a crew to (an owner or
 * admin of its team, not archived, not a crew's own or shadow board), and the crew permission must reach it
 * (the instance, team and board levels, see crewPermission.ts). The secret is returned once.
 */
export async function issueManagementToken(userId: string, projectId: unknown, now = Date.now()) {
  const real = await boardToBind({ projectId, teamId: undefined, userId, crew: null })
  const refusal = await crewPermissionRefusal(userId, real.id)
  if (refusal) throw createError({ statusCode: 403, message: refusal })
  // The instance admin's crew calls are not counted against the crew limit: they get no new refusals.
  if (!(await isInstanceAdmin(userId))) {
    await chargeRateLimit('crews', `user:${userId}`, await limitsFor('crews', await scopeOfBoard(real.id)))
  }
  const [ownCrew] = await db.select({ id: crews.id }).from(crews).where(eq(crews.boardId, real.id))
  if (ownCrew) throw createError({ statusCode: 400, message: 'A crew\'s own board cannot be given a token.' })

  const generated = generateApiKey()
  const keyId = genId()
  const name = `crew management: ${real.name}`.slice(0, 60)
  await db.transaction(async (tx) => {
    await tx.insert(apiKeys).values({
      id: keyId,
      userId,
      teamId: real.teamId,
      customerId: null,
      projectId: real.id,
      name,
      keyHash: generated.hash,
      keyPrefix: generated.displayPrefix,
      scopes: [MANAGEMENT_SCOPE],
      expiresAt: now + MANAGEMENT_TOKEN_MS,
      createdAt: now,
      allBoards: false,
      boardReachSet: false,
      kind: 'management'
    })
    await storeReach(tx, keyId, { allBoards: false, workspaceTeamIds: [], boardIds: [real.id] }, now)
    await storeBoardScopes(tx, keyId, { [real.id]: [MANAGEMENT_SCOPE] }, now)
    await tx.insert(agentAudit).values({
      id: genId(),
      userId,
      apiKeyId: keyId,
      keyName: name,
      tool: 'crew_token_issued',
      toolTitle: 'Crew API',
      projectId: real.id,
      projectName: real.name,
      summary: 'made a 10-minute management token for this board',
      createdAt: now
    })
  })
  return {
    token: generated.token,
    key: { id: keyId, name, keyPrefix: generated.displayPrefix, expiresAt: now + MANAGEMENT_TOKEN_MS },
    board: { id: real.id, name: real.name }
  }
}

/**
 * A management token works on its own board only. A call that names another board is refused; a call without
 * a board caller (an access key, or the Crews page) passes untouched.
 */
export function requireOwnBoardFor(caller: CrewCaller, projectId: unknown): void {
  if (!caller.boardId) return
  if (projectId !== caller.boardId) {
    throw createError({ statusCode: 403, message: 'This token works on its own board only.' })
  }
}

/**
 * Creating or rotating a crew by a management token: the call must name its board, and a crew that already
 * exists under that slug must be bound to that board. Other crews answer 404, as an unknown slug does.
 */
export async function requireCreateOnOwnBoard(caller: CrewCaller, slug: string, projectId: unknown): Promise<void> {
  if (caller.crewOwner) {
    // A crew owner's own key rotates a crew of theirs. Making a crew, or binding one to a board, stays with a management token.
    const [own] = await db.select().from(crews).where(eq(crews.slug, slug))
    if (!own || projectId !== undefined) throw createError({ statusCode: 403, message: CREATE_NEEDS_TOKEN })
    await requireCrewOnOwnBoard(caller, own)
    return
  }
  if (!caller.boardId) return
  requireOwnBoardFor(caller, projectId)
  const [existing] = await db.select().from(crews).where(eq(crews.slug, slug))
  if (existing) await requireCrewOnOwnBoard(caller, existing)
}

/**
 * A management token reaches a crew only when the crew is bound to its board. Other crews read as not found.
 */
export async function requireCrewOnOwnBoard(caller: CrewCaller, crew: Crew): Promise<void> {
  // A crew-scoped token reaches its own crew only (card mwdd9d2vtgqhfr6izq); any other crew gets the board sentence.
  if (caller.crewId) {
    if (crew.id !== caller.crewId) throw createError({ statusCode: 403, message: 'This token works on its own board only.' })
    return
  }
  if (caller.crewOwner) {
    // A crew owner's own key reaches the crews its owner created, and no other person's.
    if (crew.createdBy !== caller.userId) throw createError({ statusCode: 404, message: 'No crew of yours with that slug.' })
    return
  }
  if (!caller.boardId) return
  const [link] = await db.select({ id: crewBoards.id }).from(crewBoards)
    .where(and(eq(crewBoards.crewId, crew.id), eq(crewBoards.projectId, caller.boardId)))
  if (!link) throw createError({ statusCode: 404, message: 'No crew of yours with that slug.' })
}

/**
 * The 10-minute token of ONE crew, made on that crew's own (shadow) board (card mwdd9d2vtgqhfr6izq). It reaches only the
 * crew's keys and people routes: the crew gate and requireCrewOnOwnBoard enforce that. Only the instance admin, the
 * crew's creator, or an owner or admin of the crew's team may make it; a crew's own accounts never. Additive: the new
 * key carries crew_id; every other key is unchanged.
 */
export async function issueCrewToken(userId: string, shadowProjectId: unknown, now = Date.now()) {
  if (typeof shadowProjectId !== 'string' || !shadowProjectId) throw createError({ statusCode: 400, message: 'Name the crew\'s board.' })
  if (await isCrewUser(userId)) throw createError({ statusCode: 403, message: 'A crew\'s own account cannot make a crew token.' })
  const [row] = await db.select({
    crewId: crews.id,
    crewName: crews.name,
    createdBy: crews.createdBy,
    teamId: crews.teamId,
    disabledAt: crews.disabledAt,
    shadowName: projects.name
  }).from(crewBoards)
    .innerJoin(crews, eq(crews.id, crewBoards.crewId))
    .innerJoin(projects, eq(projects.id, crewBoards.shadowProjectId))
    .where(eq(crewBoards.shadowProjectId, shadowProjectId))
  if (!row || row.disabledAt) throw createError({ statusCode: 404, message: 'No such board.' })

  const admin = await isInstanceAdmin(userId)
  const roles = await db.select({ role: member.role }).from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, row.teamId)))
  const teamAdmin = roles.some(r => r.role === 'owner' || r.role === 'admin')
  if (!admin && row.createdBy !== userId && !teamAdmin) {
    throw createError({ statusCode: 403, message: 'Only the instance admin, the crew\'s creator, or an owner or admin of its team can make this token.' })
  }
  const refusal = await crewPermissionRefusal(userId, shadowProjectId)
  if (refusal) throw createError({ statusCode: 403, message: refusal })

  const generated = generateApiKey()
  const keyId = genId()
  const name = `crew token: ${row.crewName}`.slice(0, 60)
  await db.transaction(async (tx) => {
    await tx.insert(apiKeys).values({
      id: keyId,
      userId,
      teamId: row.teamId,
      customerId: null,
      projectId: shadowProjectId,
      crewId: row.crewId,
      name,
      keyHash: generated.hash,
      keyPrefix: generated.displayPrefix,
      scopes: [MANAGEMENT_SCOPE],
      expiresAt: now + MANAGEMENT_TOKEN_MS,
      createdAt: now,
      allBoards: false,
      boardReachSet: false,
      kind: 'management'
    })
    await storeReach(tx, keyId, { allBoards: false, workspaceTeamIds: [], boardIds: [shadowProjectId] }, now)
    await storeBoardScopes(tx, keyId, { [shadowProjectId]: [MANAGEMENT_SCOPE] }, now)
    await tx.insert(agentAudit).values({
      id: genId(),
      userId,
      apiKeyId: keyId,
      keyName: name,
      tool: 'crew_token_issued',
      toolTitle: 'Crew API',
      projectId: shadowProjectId,
      projectName: row.shadowName,
      summary: 'made a 10-minute token for this crew',
      createdAt: now
    })
  })
  return {
    token: generated.token,
    key: { id: keyId, name, keyPrefix: generated.displayPrefix, expiresAt: now + MANAGEMENT_TOKEN_MS },
    board: { id: shadowProjectId, name: row.shadowName }
  }
}

/**
 * Taking a crew off its boards goes through every link the crew has. A management token may do that only when
 * the board it works on is the crew's only board, so it never detaches a crew from a board it does not own.
 */
export async function requireCrewOnlyOnOwnBoard(caller: CrewCaller, crew: Crew): Promise<void> {
  if (caller.crewOwner) {
    await requireCrewOnOwnBoard(caller, crew)
    // Taking a crew off its boards is for a management token of its board, not for the owner's remote key.
    throw createError({ statusCode: 403, message: DELETE_NEEDS_TOKEN })
  }
  if (!caller.boardId) return
  await requireCrewOnOwnBoard(caller, crew)
  const links = await db.select({ projectId: crewBoards.projectId }).from(crewBoards).where(eq(crewBoards.crewId, crew.id))
  if (links.some(link => link.projectId !== caller.boardId)) {
    throw createError({ statusCode: 403, message: 'This crew works on other boards too; a token for this board cannot remove it.' })
  }
}
