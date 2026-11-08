// What a crew may reach on the real board it works on: it READS it and never writes (the shadow board
// is where the crew writes; Boss carries results over). The reach is added to a tool call only when
// the tool is a plain read on this list. A tool that reads secrets (get_project_env,
// list_project_secrets) is read-only too, but it is not on the list, so a crew never gets it for a real
// board. Every write tool resolves its board through the same filter without the grant, so a real
// board is simply not found for it.
import { and, eq, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db'
import { crewBoards, crews, member, projects, user } from '../db/schema'
import type { Project } from '../db/schema'
import type { ApiKeyContext } from './api-keys'

/** What a key's grant needs of its context: the person, the key's limit, and the teams the person belongs to. */
export type GrantContext = Pick<ApiKeyContext, 'userId' | 'teamId' | 'projectId' | 'customerId' | 'memberTeamIds'>

/** One crew link: the real board, and the shadow board the crew works on. */
export interface CrewLink { projectId: string, shadowProjectId: string }

export async function crewLinksOf(crewId: string): Promise<CrewLink[]> {
  return db.select({ projectId: crewBoards.projectId, shadowProjectId: crewBoards.shadowProjectId })
    .from(crewBoards)
    .where(eq(crewBoards.crewId, crewId))
}

/**
 * The team whose shadow boards a key may read: its own team, when the key is not limited to one board and
 * the owner is still a member of that team. A team the owner has left grants nothing.
 */
export function shadowTeamOf(context: Pick<GrantContext, 'teamId' | 'projectId' | 'memberTeamIds'>): string | null {
  return context.teamId && !context.projectId && context.memberTeamIds.includes(context.teamId) ? context.teamId : null
}

/** The shadow boards of several teams, by team: one query for a whole list of keys. */
export async function shadowBoardsOfTeams(teamIds: string[]): Promise<Map<string, string[]>> {
  const byTeam = new Map<string, string[]>()
  if (!teamIds.length) return byTeam
  const real = alias(projects, 'real_board')
  const rows = await db
    .select({ id: crewBoards.shadowProjectId, teamId: real.teamId })
    .from(crewBoards)
    .innerJoin(real, eq(real.id, crewBoards.projectId))
    .where(inArray(real.teamId, teamIds))
  for (const row of rows) {
    if (row.teamId) byTeam.set(row.teamId, [...(byTeam.get(row.teamId) ?? []), row.id])
  }
  return byTeam
}

/**
 * The boards a grant gives a key, from the crew links of its person and the shadow boards of its team.
 * Pure: the caller reads the links and the shadow boards, once, and passes them in.
 */
export function grantedBoardIdsOf(context: GrantContext, links: CrewLink[], shadowIds: string[]): string[] {
  if (context.customerId) return []
  const linked = context.projectId ? links.filter(link => link.shadowProjectId === context.projectId) : links
  const granted = linked.map(link => link.projectId)
  if (shadowTeamOf(context)) granted.push(...shadowIds)
  return granted
}

/** The reads a crew may do on a real board: the board, its tasks and threads, never its secrets or its rules. */
export const GRANT_READABLE_TOOLS: ReadonlySet<string> = new Set([
  'get_board',
  'list_boards',
  'get_task',
  'search_tasks',
  'list_task_labels',
  'list_status_updates',
  'list_messages',
  'list_fields'
])

/** Whether a tool call may be given the crew's read reach: a read-only tool, and one on the list above. */
export function mayUseReadGrant(tool: { name: string, readOnly: boolean }): boolean {
  return tool.readOnly && GRANT_READABLE_TOOLS.has(tool.name)
}

/**
 * The shadow boards of a team's boards: the staff of the real board may READ them (Q35a, never
 * writes), and a customer never can, since a customer has no team here.
 */
export async function shadowBoardIdsOfTeam(teamId: string): Promise<string[]> {
  const real = alias(projects, 'real_board')
  const rows = await db
    .select({ id: crewBoards.shadowProjectId })
    .from(crewBoards)
    .innerJoin(real, eq(real.id, crewBoards.projectId))
    .where(eq(real.teamId, teamId))
  return rows.map(row => row.id)
}

/** The shadow board `projectId` as a team's staff may read it, or undefined when it is not one of theirs. */
export async function shadowBoardForStaff(teamId: string | null, projectId: string): Promise<Project | undefined> {
  if (!teamId) return undefined
  const real = alias(projects, 'real_board')
  const [row] = await db
    .select({ shadow: projects })
    .from(crewBoards)
    .innerJoin(projects, eq(projects.id, crewBoards.shadowProjectId))
    .innerJoin(real, eq(real.id, crewBoards.projectId))
    .where(and(eq(crewBoards.shadowProjectId, projectId), eq(real.teamId, teamId)))
  return row?.shadow
}

/**
 * Whether `projectId` is one of the crew's own boards: a shadow board linked to the crew, or the board the
 * crew was made on. Either must sit in the crew's own team. A crew may back up and restore its own boards in
 * full (owner's decision), and never a real board.
 */
export async function isOwnCrewBoard(crewId: string, projectId: string): Promise<boolean> {
  const [crew] = await db.select({ teamId: crews.teamId, boardId: crews.boardId }).from(crews).where(eq(crews.id, crewId))
  if (!crew) return false
  const [board] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, projectId))
  if (!board || board.teamId !== crew.teamId) return false
  if (crew.boardId === projectId) return true
  const [link] = await db.select({ id: crewBoards.id }).from(crewBoards)
    .where(and(eq(crewBoards.crewId, crewId), eq(crewBoards.shadowProjectId, projectId)))
  return Boolean(link)
}

/** Whether `userId` belongs to a team whose board `projectId` is the shadow of: for serving files. */
export async function isStaffOfShadowedBoard(userId: string, projectId: string): Promise<boolean> {
  const real = alias(projects, 'real_board')
  const [row] = await db
    .select({ id: crewBoards.id })
    .from(crewBoards)
    .innerJoin(real, eq(real.id, crewBoards.projectId))
    .innerJoin(member, and(eq(member.organizationId, real.teamId), eq(member.userId, userId)))
    .where(eq(crewBoards.shadowProjectId, projectId))
  return Boolean(row)
}

/**
 * The boards a key's person may READ through a crew link, beyond its own reach:
 *   - a crew account reads the real boards its crew was given. A key limited to one board (a member
 *     forked for that board) reads only the real board its own shadow board is linked to;
 *   - the staff of a real board read its shadow board, with a key for the whole team.
 * A key limited to a customer gets none, so its reach never widens.
 */
export async function readGrantedBoardIds(context: GrantContext): Promise<string[]> {
  if (context.customerId) return []
  const [account] = await db.select({ crewId: user.crewId }).from(user).where(eq(user.id, context.userId))
  const links = account?.crewId ? await crewLinksOf(account.crewId) : []
  const shadowTeam = shadowTeamOf(context)
  const shadowIds = shadowTeam ? await shadowBoardIdsOfTeam(shadowTeam) : []
  const granted = grantedBoardIdsOf(context, links, shadowIds)
  return granted
}
