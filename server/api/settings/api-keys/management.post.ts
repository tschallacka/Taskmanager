import { and, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { crewBoards } from '../../../db/schema'
import { issueCrewToken, issueManagementToken } from '../../../utils/managementToken'

/**
 * Makes the 10-minute management token for one board, the one the sidebar link "Put an AI crew to work on this board"
 * asks for. Body: { projectId }. The caller must have the crew permission and be owner or admin of the board's team.
 * On a crew's own (shadow) board it makes the crew token instead (card mwdd9d2vtgqhfr6izq), which reaches only that crew.
 * The token and its key are returned once; it stops working after 10 minutes, or when the permission goes.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ projectId?: unknown }>(event).catch(() => null)
  const userId = event.context.session.user.id
  const projectId = typeof body?.projectId === 'string' ? body.projectId : ''
  const [shadow] = projectId
    ? await db.select({ id: crewBoards.id }).from(crewBoards).where(and(eq(crewBoards.shadowProjectId, projectId)))
    : []
  if (shadow) return issueCrewToken(userId, projectId)
  return issueManagementToken(userId, body?.projectId)
})
