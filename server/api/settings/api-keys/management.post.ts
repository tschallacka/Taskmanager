import { issueManagementToken } from '../../../utils/managementToken'

/**
 * Makes the 10-minute management token for one board, the one the sidebar link "Put an AI crew to work on this board" asks
 * for. Body: { projectId }. The caller must have the crew permission and be owner or admin of the board's team.
 * The token and its key are returned once; it stops working after 10 minutes, or when the permission goes.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ projectId?: unknown }>(event).catch(() => null)
  const userId = event.context.session.user.id
  return issueManagementToken(userId, body?.projectId)
})
