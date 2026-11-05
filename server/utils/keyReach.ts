// Choosing what an API key reaches, and reading it back: Select all, whole workspaces and single boards.
// The owner picks from the boards they can open now, across every workspace they are in. A pick is
// stored in the reach tables, and the check on each call (mcpAccess.ts) still cuts it down to what the
// owner can open at that moment.
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { agentAudit, apiKeyBoards, apiKeyWorkspaces, apiKeys, member, organization, projects } from '../db/schema'
import type { ApiKey, ApiKeyScope } from '../db/schema'
import type { ApiKeyContext } from './api-keys'
import { boardFilter } from './mcpAccess'
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
  const context: ApiKeyContext = {
    keyId: '',
    keyName: '',
    userId,
    teamId: null,
    customerId: null,
    projectId: null,
    scopes: [] as ApiKeyScope[],
    reach: { allBoards: true, workspaceTeamIds: [], boardIds: [] },
    memberTeamIds: memberships.map(workspace => workspace.id)
  }
  const rows = await db.select({ id: projects.id, name: projects.name, teamId: projects.teamId, archivedAt: projects.archivedAt })
    .from(projects)
    .where(await boardFilter(context))
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

/** The reach as one line for the audit: what the key reaches now. */
export function reachSummary(reach: ReachRequest): string {
  if (reach.allBoards) return 'all your boards, now and later'
  const parts = []
  if (reach.workspaceTeamIds.length) parts.push(`${reach.workspaceTeamIds.length} workspace${reach.workspaceTeamIds.length === 1 ? '' : 's'}`)
  if (reach.boardIds.length) parts.push(`${reach.boardIds.length} board${reach.boardIds.length === 1 ? '' : 's'}`)
  return parts.join(' and ')
}
