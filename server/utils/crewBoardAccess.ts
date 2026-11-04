// What a crew may reach on the real board it works on: it READS it and never writes (the shadow board
// is where the crew writes; Boss carries results over). The reach is added to a tool call only when
// the tool is a plain read on this list. A tool that reads secrets (get_project_env,
// list_project_secrets) is read-only too, but it is not on the list, so a crew never gets it for a real
// board. Every write tool resolves its board through the same filter without the grant, so a real
// board is simply not found for it.
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { crewBoards, user } from '../db/schema'
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
 * The real boards a key's person may read through a crew link. Only a crew account has any. A key
 * limited to one board (a member forked for that board) reads only the real board its own shadow
 * board is linked to; a key limited to a customer gets none, so its reach never widens.
 */
export async function readGrantedBoardIds(context: Pick<ApiKeyContext, 'userId' | 'projectId' | 'customerId'>): Promise<string[]> {
  if (context.customerId) return []
  const [account] = await db.select({ crewId: user.crewId }).from(user).where(eq(user.id, context.userId))
  if (!account?.crewId) return []
  const links = await db
    .select({ projectId: crewBoards.projectId })
    .from(crewBoards)
    .where(context.projectId
      ? and(eq(crewBoards.crewId, account.crewId), eq(crewBoards.shadowProjectId, context.projectId))
      : eq(crewBoards.crewId, account.crewId))
  return links.map(link => link.projectId)
}
