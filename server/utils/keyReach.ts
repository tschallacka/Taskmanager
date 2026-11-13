// Choosing what an API key reaches, and reading it back: Select all, whole workspaces and single boards.
// The owner picks from the boards they can open now, across every workspace they are in. A pick is
// stored in the reach tables, and the check on each call (mcpAccess.ts) still cuts it down to what the
// owner can open at that moment.
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { db } from '../db'
import { agentAudit, apiKeyBoards, apiKeyWorkspaces, apiKeys, member, organization, projects } from '../db/schema'
import type { ApiKey } from '../db/schema'
import { keyReachOf } from './api-keys'
import type { KeyReach } from './api-keys'
import { customerIdsOf } from './auth-helpers'
import { crewLinksOf, grantedBoardIdsOf, shadowBoardsOfTeams, shadowTeamOf } from './crewBoardAccess'
import type { GrantContext } from './crewBoardAccess'
import { guestProjectIdsOf } from './guests'
import { openBoardScope } from './mcpAccess'
import { workspaceTopic } from './realtime'
import { crewIdOfUser } from './boardTree'
import { genId } from './projects'

/** What the owner picked. A null workspace is the personal workspace. */
export interface ReachRequest {
  allBoards: boolean
  workspaceTeamIds: (string | null)[]
  boardIds: string[]
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** The workspaces a person is a member of now, by name. */
export async function workspacesOf(userId: string): Promise<{ id: string, name: string }[]> {
  return db.select({ id: organization.id, name: organization.name })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
}

/** The boards a person can open now, across every workspace they are in, not archived. */
export async function openBoardsOf(userId: string) {
  const memberships = await workspacesOf(userId)
  const { open } = await openBoardScope(userId, memberships.map(workspace => workspace.id))
  const rows = await db.select({ id: projects.id, name: projects.name, teamId: projects.teamId, archivedAt: projects.archivedAt })
    .from(projects)
    .where(open)
  return rows.filter(row => !row.archivedAt)
}

/**
 * Reads a pick from a request. Every board must be one the owner can open now, and every workspace
 * one they are a member of; Select all drops the rest of the pick. Refuses an empty pick.
 */
export async function readReachRequest(userId: string, raw: unknown): Promise<ReachRequest> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const allBoards = body.allBoards === true
  if (allBoards) return { allBoards: true, workspaceTeamIds: [], boardIds: [] }

  const workspaceList = Array.isArray(body.workspaceTeamIds) ? body.workspaceTeamIds : []
  const boardList = Array.isArray(body.boardIds) ? body.boardIds : []
  if (workspaceList.some(value => value !== null && typeof value !== 'string')
    || boardList.some(value => typeof value !== 'string')) {
    throw createError({ statusCode: 400, message: 'The boards and workspaces of a key must be ids' })
  }

  const memberTeams = new Set((await workspacesOf(userId)).map(workspace => workspace.id))
  const workspaceTeamIds = [...new Set(workspaceList as (string | null)[])]
  if (workspaceTeamIds.some(teamId => teamId !== null && !memberTeams.has(teamId))) {
    throw createError({ statusCode: 400, message: 'A workspace is not one you are a member of' })
  }

  const boardIds = [...new Set(boardList as string[])]
  const openIds = new Set((await openBoardsOf(userId)).map(board => board.id))
  if (boardIds.some(id => !openIds.has(id))) {
    throw createError({ statusCode: 400, message: 'A board is not one you can open' })
  }

  if (!workspaceTeamIds.length && !boardIds.length) {
    throw createError({ statusCode: 400, message: 'Pick at least one board or workspace, or Select all' })
  }
  return { allBoards: false, workspaceTeamIds, boardIds }
}

/** The reach a team key gets from its limit: the whole team, one customer's boards, or one board. */
export function teamReachOf(teamId: string, limit: { projectId: string | null }): ReachRequest {
  if (limit.projectId) return { allBoards: false, workspaceTeamIds: [], boardIds: [limit.projectId] }
  return { allBoards: false, workspaceTeamIds: [teamId], boardIds: [] }
}

/** Replaces what a key reaches with the pick. Runs inside the caller's transaction. */
export async function storeReach(tx: Tx, keyId: string, reach: ReachRequest, now = Date.now()): Promise<void> {
  await tx.delete(apiKeyWorkspaces).where(eq(apiKeyWorkspaces.keyId, keyId))
  await tx.delete(apiKeyBoards).where(eq(apiKeyBoards.keyId, keyId))
  if (reach.workspaceTeamIds.length) {
    await tx.insert(apiKeyWorkspaces).values(reach.workspaceTeamIds.map(teamId => ({ id: genId(), keyId, teamId, createdAt: now })))
  }
  if (reach.boardIds.length) {
    await tx.insert(apiKeyBoards).values(reach.boardIds.map(projectId => ({ id: genId(), keyId, projectId, createdAt: now })))
  }
  await tx.update(apiKeys).set({ allBoards: reach.allBoards, boardReachSet: true }).where(eq(apiKeys.id, keyId))
}

export interface KeyReachView {
  allBoards: boolean
  workspaces: { teamId: string | null, name: string | null }[]
  boards: { id: string, name: string, teamId: string | null }[]
}

/** What each key reaches, by name, for the lists. A key the reach move has not reached yet is read from its columns. */
export async function reachViewsOf(keys: ApiKey[]): Promise<Map<string, KeyReachView>> {
  const views = new Map<string, KeyReachView>()
  if (!keys.length) return views
  const keyIds = keys.map(key => key.id)
  const [workspaceRows, boardRows] = await Promise.all([
    db.select({ keyId: apiKeyWorkspaces.keyId, teamId: apiKeyWorkspaces.teamId }).from(apiKeyWorkspaces).where(inArray(apiKeyWorkspaces.keyId, keyIds)),
    db.select({ keyId: apiKeyBoards.keyId, projectId: apiKeyBoards.projectId }).from(apiKeyBoards).where(inArray(apiKeyBoards.keyId, keyIds))
  ])

  const teamIds = new Set<string>()
  const boardIds = new Set<string>()
  const workspacesOfKey = new Map<string, (string | null)[]>()
  const boardsOfKey = new Map<string, string[]>()
  for (const key of keys) {
    if (key.boardReachSet) {
      workspacesOfKey.set(key.id, workspaceRows.filter(row => row.keyId === key.id).map(row => row.teamId))
      boardsOfKey.set(key.id, boardRows.filter(row => row.keyId === key.id).map(row => row.projectId))
    } else if (key.projectId) {
      boardsOfKey.set(key.id, [key.projectId])
    } else {
      workspacesOfKey.set(key.id, [key.teamId])
    }
    for (const teamId of workspacesOfKey.get(key.id) ?? []) if (teamId) teamIds.add(teamId)
    for (const id of boardsOfKey.get(key.id) ?? []) boardIds.add(id)
  }

  const teams = teamIds.size
    ? await db.select({ id: organization.id, name: organization.name }).from(organization).where(inArray(organization.id, [...teamIds]))
    : []
  const boards = boardIds.size
    ? await db.select({ id: projects.id, name: projects.name, teamId: projects.teamId }).from(projects).where(inArray(projects.id, [...boardIds]))
    : []
  const teamName = new Map(teams.map(team => [team.id, team.name]))
  const boardById = new Map(boards.map(board => [board.id, board]))

  for (const key of keys) {
    views.set(key.id, {
      allBoards: key.boardReachSet ? key.allBoards : false,
      workspaces: (workspacesOfKey.get(key.id) ?? []).map(teamId => ({ teamId, name: teamId ? teamName.get(teamId) ?? null : 'Personal' })),
      boards: (boardsOfKey.get(key.id) ?? []).flatMap((id) => {
        const board = boardById.get(id)
        return board ? [{ id, name: board.name, teamId: board.teamId }] : []
      })
    })
  }
  return views
}

/**
 * The live-refresh topic a write goes to. A write on a board refreshes the workspace the board is in,
 * which need not be the key's own workspace; without a board, the key's workspace.
 */
export function workspaceTopicOfWrite(userId: string, boardTeamId: string | null | undefined, keyTeamId: string | null): string {
  return workspaceTopic(userId, boardTeamId === undefined ? keyTeamId : boardTeamId)
}

/** The workspace a board is in, or undefined when no board has that id. */
export async function workspaceOfBoard(projectId: string): Promise<string | null | undefined> {
  const [row] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, projectId))
  return row ? row.teamId : undefined
}

/** One line in the agent audit about a key the owner changed. Best effort: a failure is logged and swallowed. */
export async function recordKeyChange(userId: string, key: { id: string, name: string }, summary: string): Promise<void> {
  try {
    await db.insert(agentAudit).values({
      id: genId(),
      userId,
      apiKeyId: key.id,
      keyName: key.name,
      tool: 'api_key.update',
      toolTitle: 'API key changed',
      summary,
      createdAt: Date.now()
    })
  } catch (error) {
    console.error('[api-keys] could not audit a key change', error)
  }
}

export interface ReachedBoard {
  id: string
  name: string
  teamId: string | null
  /** The workspace's name, or Personal. */
  workspace: string
  /** A real board a crew reads through its link: the key reads it, and never changes it. */
  readOnly: boolean
}

type OwnerScope = { userId: string, memberTeamIds: string[], customerIds: string[], guestIds: string[] }
type BoardRow = { id: string, userId: string, teamId: string | null, customerId: string | null }

/**
 * The rule of boardFilter (mcpAccess.ts), read in memory: a board the owner can open, that the key's reach
 * grants, and that is inside the key's customer when the key is limited to one.
 */
function reachesBoard(board: BoardRow, reach: KeyReach, customerId: string | null, owner: OwnerScope): boolean {
  const ownPersonal = board.teamId === null && board.userId === owner.userId
  const ofCustomer = board.customerId !== null && owner.customerIds.includes(board.customerId)
  const asGuest = owner.guestIds.includes(board.id)
  const open = (board.teamId !== null && owner.memberTeamIds.includes(board.teamId)) || ownPersonal || ofCustomer || asGuest
  const granted = (reach.allBoards && open)
    || reach.workspaceTeamIds.some(teamId => (teamId ? board.teamId === teamId : ownPersonal || ofCustomer || asGuest))
    || reach.boardIds.includes(board.id)
  return open && (customerId ? granted && board.customerId === customerId : granted)
}

/**
 * The boards each key reaches now, by name and workspace: what its reach covers and the owner can open,
 * plus the real boards a crew reads through its link, marked read-only. The owner's lists and the keys'
 * reach rows are read once for the whole list, and one query reads the boards; each key is then cut from
 * them in memory, by the rule of boardFilter (mcpAccess.ts) and readGrantedBoardIds (crewBoardAccess.ts).
 */
export async function reachedBoardsOf(userId: string, keys: ApiKey[]): Promise<Map<string, ReachedBoard[]>> {
  const result = new Map<string, ReachedBoard[]>()
  if (!keys.length) return result
  const keyIds = keys.map(key => key.id)
  const [workspaces, customerIds, guestIds, crewId, keyWorkspaceRows, keyBoardRows] = await Promise.all([
    workspacesOf(userId),
    customerIdsOf(userId),
    guestProjectIdsOf(userId),
    crewIdOfUser(userId),
    db.select({ keyId: apiKeyWorkspaces.keyId, teamId: apiKeyWorkspaces.teamId }).from(apiKeyWorkspaces).where(inArray(apiKeyWorkspaces.keyId, keyIds)),
    db.select({ keyId: apiKeyBoards.keyId, projectId: apiKeyBoards.projectId }).from(apiKeyBoards).where(inArray(apiKeyBoards.keyId, keyIds))
  ])
  const owner: OwnerScope = { userId, memberTeamIds: workspaces.map(workspace => workspace.id), customerIds, guestIds }
  const workspaceName = new Map(workspaces.map(workspace => [workspace.id, workspace.name]))
  const workspaceOf = (teamId: string | null) => (teamId ? workspaceName.get(teamId) ?? 'a team' : 'Personal')

  const grantOf = (key: ApiKey): GrantContext => ({
    userId,
    teamId: key.teamId,
    projectId: key.projectId,
    customerId: key.customerId,
    memberTeamIds: owner.memberTeamIds
  })
  const crewLinks = crewId ? await crewLinksOf(crewId) : []
  const shadowTeams = keys.map(key => shadowTeamOf(grantOf(key))).filter((teamId): teamId is string => teamId !== null)
  const shadowsByTeam = await shadowBoardsOfTeams(shadowTeams, userId)
  const crewGranted = new Map<string, string[]>(keys.map((key) => {
    const shadowTeam = shadowTeamOf(grantOf(key))
    return [key.id, grantedBoardIdsOf(grantOf(key), crewLinks, shadowTeam ? shadowsByTeam.get(shadowTeam) ?? [] : [])]
  }))

  const openScope = or(
    owner.memberTeamIds.length ? inArray(projects.teamId, owner.memberTeamIds) : undefined,
    and(eq(projects.userId, userId), isNull(projects.teamId)),
    customerIds.length ? inArray(projects.customerId, customerIds) : undefined,
    guestIds.length ? inArray(projects.id, guestIds) : undefined
  )!
  const crewIds = [...new Set([...crewGranted.values()].flat())]
  const candidates = await db.select({
    id: projects.id,
    name: projects.name,
    teamId: projects.teamId,
    userId: projects.userId,
    customerId: projects.customerId,
    archivedAt: projects.archivedAt
  })
    .from(projects)
    .where(crewIds.length ? or(openScope, inArray(projects.id, crewIds)) : openScope)

  // A crew's read-only board can sit in a team the owner is not in: its name comes from one more read.
  const unnamed = [...new Set(candidates.map(row => row.teamId).filter((teamId): teamId is string => teamId !== null && !workspaceName.has(teamId)))]
  if (unnamed.length) {
    const names = await db.select({ id: organization.id, name: organization.name }).from(organization).where(inArray(organization.id, unnamed))
    for (const team of names) workspaceName.set(team.id, team.name)
  }
  for (const key of keys) {
    const reach = keyReachOf(key, keyWorkspaceRows.filter(row => row.keyId === key.id), keyBoardRows.filter(row => row.keyId === key.id))
    const crew = new Set(crewGranted.get(key.id))
    const boards: ReachedBoard[] = []
    for (const row of candidates) {
      if (row.archivedAt) continue
      const reachable = reachesBoard(row, reach, key.customerId, owner)
      if (!reachable && !crew.has(row.id)) continue
      boards.push({ id: row.id, name: row.name, teamId: row.teamId, workspace: workspaceOf(row.teamId), readOnly: !reachable })
    }
    boards.sort((a, b) => a.workspace.localeCompare(b.workspace) || a.name.localeCompare(b.name))
    result.set(key.id, boards)
  }
  return result
}

/** The reach as one line for the audit: what the key reaches now. */
export function reachSummary(reach: ReachRequest): string {
  if (reach.allBoards) return 'all your boards, now and later'
  const parts = []
  if (reach.workspaceTeamIds.length) parts.push(`${reach.workspaceTeamIds.length} workspace${reach.workspaceTeamIds.length === 1 ? '' : 's'}`)
  if (reach.boardIds.length) parts.push(`${reach.boardIds.length} board${reach.boardIds.length === 1 ? '' : 's'}`)
  return parts.join(' and ')
}
