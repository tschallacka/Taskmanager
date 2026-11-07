// The 10-minute management token: the crew token a person makes from the sidebar ("Get AI management token").
// It is an API key of kind 'management' bound to ONE board: its team, and crews:manage on that board only.
// It expires after 10 minutes (expires_at, refused by authenticateApiKey with token_expired), and it never has
// more rights than its owner has now: the crew permission and the owner-or-admin role of the board's team are
// checked when it is made and again on every crew call (requireCrewManager and the crew gate).
import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { db } from '../db'
import { agentAudit, apiKeys, crewBoards, crews, user } from '../db/schema'
import type { Crew } from '../db/schema'
import { generateApiKey } from './api-keys'
import { storeBoardScopes } from './connectTokens'
import { boardToBind } from './crewBoards'
import type { CrewCaller } from './crewProvisioning'
import { storeReach } from './keyReach'
import { genId } from './projects'

export const MANAGEMENT_TOKEN_MS = 10 * 60_000
export const MANAGEMENT_SCOPE = 'crews:manage'

/**
 * Whether a person may hold a crew token: the crew permission. Today only the instance admin may make crews,
 * so the admin's permission is the one that counts. Read from the database, not the session.
 */
export async function hasCrewPermission(userId: string): Promise<boolean> {
  const [row] = await db.select({ isInstanceAdmin: user.isInstanceAdmin }).from(user).where(eq(user.id, userId))
  return Boolean(row?.isInstanceAdmin)
}

/**
 * Makes the management token for one board. The board must be one the person may bind a crew to (an owner or
 * admin of its team, not archived, not a crew's own or shadow board). The secret is returned once.
 */
export async function issueManagementToken(userId: string, projectId: unknown, now = Date.now()) {
  if (!(await hasCrewPermission(userId))) {
    throw createError({ statusCode: 403, message: 'You do not have permission to manage crews.' })
  }
  const real = await boardToBind({ projectId, teamId: undefined, userId, crew: null })
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
  if (!caller.boardId) return
  requireOwnBoardFor(caller, projectId)
  const [existing] = await db.select().from(crews).where(eq(crews.slug, slug))
  if (existing) await requireCrewOnOwnBoard(caller, existing)
}

/**
 * A management token reaches a crew only when the crew is bound to its board. Other crews read as not found.
 */
export async function requireCrewOnOwnBoard(caller: CrewCaller, crew: Crew): Promise<void> {
  if (!caller.boardId) return
  const [link] = await db.select({ id: crewBoards.id }).from(crewBoards)
    .where(and(eq(crewBoards.crewId, crew.id), eq(crewBoards.projectId, caller.boardId)))
  if (!link) throw createError({ statusCode: 404, message: 'No crew of yours with that slug.' })
}

/**
 * Taking a crew off its boards goes through every link the crew has. A management token may do that only when
 * the board it works on is the crew's only board, so it never detaches a crew from a board it does not own.
 */
export async function requireCrewOnlyOnOwnBoard(caller: CrewCaller, crew: Crew): Promise<void> {
  if (!caller.boardId) return
  await requireCrewOnOwnBoard(caller, crew)
  const links = await db.select({ projectId: crewBoards.projectId }).from(crewBoards).where(eq(crewBoards.crewId, crew.id))
  if (links.some(link => link.projectId !== caller.boardId)) {
    throw createError({ statusCode: 403, message: 'This crew works on other boards too; a token for this board cannot remove it.' })
  }
}
