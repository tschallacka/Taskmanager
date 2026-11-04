// What a crew may reach on the real board it works on: it READS it and never writes (the shadow board
// is where the crew writes; Boss carries results over). The reach is added to a tool call only when
// the tool is a plain read on this list. A tool that reads secrets (get_project_env,
// list_project_secrets) is read-only too, but it is not on the list, so a crew never gets it for a real
// board. Every write tool resolves its board through the same filter without the grant, so a real
// board is simply not found for it.
import { and, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db'
import { crewBoards, member, projects, user } from '../db/schema'
import type { Project } from '../db/schema'
import type { ApiKeyContext } from './api-keys'

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

  if (context.teamId && !context.projectId) granted.push(...await shadowBoardIdsOfTeam(context.teamId))
  return granted
}
