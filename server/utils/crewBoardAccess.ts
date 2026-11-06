// What a crew may reach on the real board it works on: it READS it and never writes (the shadow board
// is where the crew writes; Boss carries results over). The reach is added to a tool call only when
// the tool is a plain read on this list. A tool that reads secrets (get_project_env,
// list_project_secrets) is read-only too, but it is not on the list, so a crew never gets it for a real
// board. Every write tool resolves its board through the same filter without the grant, so a real
// board is simply not found for it.
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db'
import { crewBoards, crews, member, projectColumns, projectMembers, projects, projectTasks, user } from '../db/schema'
import type { Project } from '../db/schema'
import type { ApiKeyContext } from './api-keys'
import { terminalColumnIds } from '#shared/utils/board'

/** A crew board of a real board, as the header of the real board links to it. */
export interface CrewBoardLink {
  shadowProjectId: string
  name: string
  crewName: string
  openTasks: number
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
 * The crew links on a team's real boards that this person may see as a crew board (Q92, Q93):
 *   - the team's owner sees every one;
 *   - an admin sees one only where they manage the real board: its creator, or a manager on it;
 *   - an ordinary member sees only the crews they set up;
 *   - anyone else sees none.
 */
async function crewLinksSeenBy(userId: string, teamId: string): Promise<{ shadowProjectId: string, projectId: string }[]> {
  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, teamId), eq(member.userId, userId)))
  if (!membership) return []

  const real = alias(projects, 'real_board')
  const links = await db
    .select({
      shadowProjectId: crewBoards.shadowProjectId,
      projectId: crewBoards.projectId,
      realOwnerId: real.userId,
      crewCreatedBy: crews.createdBy
    })
    .from(crewBoards)
    .innerJoin(real, eq(real.id, crewBoards.projectId))
    .innerJoin(crews, eq(crews.id, crewBoards.crewId))
    .where(eq(real.teamId, teamId))

  if (membership.role === 'owner') return links
  if (membership.role === 'admin') {
    const managed = await db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(and(eq(projectMembers.userId, userId), eq(projectMembers.role, 'manager')))
    const managedIds = new Set(managed.map(row => row.projectId))
    return links.filter(link => link.realOwnerId === userId || managedIds.has(link.projectId))
  }
  return links.filter(link => link.crewCreatedBy === userId)
}

/** The shadow boards of a team's boards that this person may read. Read only: the crew writes there. */
export async function shadowBoardIdsOfTeam(teamId: string, userId: string): Promise<string[]> {
  return (await crewLinksSeenBy(userId, teamId)).map(link => link.shadowProjectId)
}

/** The shadow board `projectId` as this person may read it, or undefined when they may not. */
export async function shadowBoardForStaff(userId: string, teamId: string | null, projectId: string): Promise<Project | undefined> {
  if (!teamId) return undefined
  const seen = await crewLinksSeenBy(userId, teamId)
  if (!seen.some(link => link.shadowProjectId === projectId)) return undefined
  const [shadow] = await db.select().from(projects).where(eq(projects.id, projectId))
  return shadow
}

/** The open tasks of a board: its live top-level tasks outside the columns that read as an ending. */
async function openTaskCount(projectId: string): Promise<number> {
  const columns = await db
    .select({ id: projectColumns.id, name: projectColumns.name })
    .from(projectColumns)
    .where(and(eq(projectColumns.projectId, projectId), isNull(projectColumns.deletedAt)))
    .orderBy(asc(projectColumns.position))
  const ending = new Set(terminalColumnIds(columns))
  const tasks = await db
    .select({ columnId: projectTasks.columnId })
    .from(projectTasks)
    .where(and(eq(projectTasks.projectId, projectId), isNull(projectTasks.deletedAt), isNull(projectTasks.parentTaskId)))
  return tasks.filter(task => !ending.has(task.columnId)).length
}

/** The crew boards of one real board that this person may see, each with its name, its crew and how many tasks are open. */
export async function crewBoardsOfRealBoard(userId: string, realProjectId: string): Promise<CrewBoardLink[]> {
  const [real] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, realProjectId))
  if (!real?.teamId) return []
  const seen = (await crewLinksSeenBy(userId, real.teamId))
    .filter(link => link.projectId === realProjectId)
    .map(link => link.shadowProjectId)
  if (!seen.length) return []
  const shadows = await db
    .select({ id: projects.id, name: projects.name, crewName: crews.name })
    .from(crewBoards)
    .innerJoin(projects, eq(projects.id, crewBoards.shadowProjectId))
    .innerJoin(crews, eq(crews.id, crewBoards.crewId))
    .where(and(eq(crewBoards.projectId, realProjectId), isNull(projects.archivedAt), inArray(projects.id, seen)))
    .orderBy(asc(crews.name))
  return Promise.all(shadows.map(async shadow => ({
    shadowProjectId: shadow.id,
    name: shadow.name,
    crewName: shadow.crewName,
    openTasks: await openTaskCount(shadow.id)
  })))
}

/** The real board a crew board works on (its name and team), or null when the board is not a crew board. */
export async function realBoardOfCrewBoard(shadowProjectId: string): Promise<{ name: string, teamId: string | null } | null> {
  const real = alias(projects, 'real_board')
  const [row] = await db
    .select({ name: real.name, teamId: real.teamId })
    .from(crewBoards)
    .innerJoin(real, eq(real.id, crewBoards.projectId))
    .where(eq(crewBoards.shadowProjectId, shadowProjectId))
  return row ?? null
}

/** Every crew board the person may read, across all the teams they are on. Read only. */
export async function shadowBoardIdsSeenBy(userId: string): Promise<string[]> {
  const teams = await db.select({ teamId: member.organizationId }).from(member).where(eq(member.userId, userId))
  return (await Promise.all(teams.map(team => shadowBoardIdsOfTeam(team.teamId, userId)))).flat()
}

/** Whether `userId` may read the shadow board `projectId` as a crew board: for serving files. */
export async function isStaffOfShadowedBoard(userId: string, projectId: string): Promise<boolean> {
  const real = alias(projects, 'real_board')
  const [row] = await db
    .select({ teamId: real.teamId })
    .from(crewBoards)
    .innerJoin(real, eq(real.id, crewBoards.projectId))
    .where(eq(crewBoards.shadowProjectId, projectId))
  if (!row?.teamId) return false
  return (await crewLinksSeenBy(userId, row.teamId)).some(link => link.shadowProjectId === projectId)
}

/**
 * The boards a key's person may READ through a crew link, beyond its own reach:
 *   - a crew account reads the real boards its crew was given. A key limited to one board (a member
 *     forked for that board) reads only the real board its own shadow board is linked to;
 *   - the staff of a real board read its shadow board, with a key for the whole team.
 * A key limited to a customer gets none, so its reach never widens.
 */
export async function readGrantedBoardIds(context: Pick<ApiKeyContext, 'userId' | 'teamId' | 'projectId' | 'customerId'>): Promise<string[]> {
  if (context.customerId) return []
  const granted: string[] = []

  const [account] = await db.select({ crewId: user.crewId }).from(user).where(eq(user.id, context.userId))
  if (account?.crewId) {
    const links = await db
      .select({ projectId: crewBoards.projectId })
      .from(crewBoards)
      .where(context.projectId
        ? and(eq(crewBoards.crewId, account.crewId), eq(crewBoards.shadowProjectId, context.projectId))
        : eq(crewBoards.crewId, account.crewId))
    granted.push(...links.map(link => link.projectId))
  }

  if (context.teamId && !context.projectId) granted.push(...await shadowBoardIdsOfTeam(context.teamId, context.userId))
  return granted
}
