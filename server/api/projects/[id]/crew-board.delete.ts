import { hiddenCrewShadows } from '../../../utils/boardTree'
import { crewBoardOf, deleteCrewBoard, mayDeleteCrewBoard } from '../../../utils/crewBoards'
import { closeTopic, publicProjectTopic, publishFromEvent } from '../../../utils/realtime'

// Deletes a crew's shadow board for good, with its tasks and the crew's link to the real board. The board's owner, the
// team member its crew is coupled to, an owner or admin of its team, or the instance admin may; a crew account never.
// Ordinary boards are deleted through DELETE /api/projects/:id, so a board that is not a crew's shadow is not found here,
// and a shadow the person may not see is not found either (hiddenCrewShadows).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const userId = event.context.session.user.id

  const board = await crewBoardOf(id)
  if (!board) throw createError({ statusCode: 404, message: 'Project not found' })
  if ((await hiddenCrewShadows(userId, [id])).has(id)) throw createError({ statusCode: 404, message: 'Project not found' })
  if (!(await mayDeleteCrewBoard(userId, board))) {
    throw createError({ statusCode: 403, message: 'Only the board\'s owner, its crew\'s owner, an owner or admin of its team, or the instance admin can delete a crew board' })
  }

  await deleteCrewBoard(id)
  await publishFromEvent(event, { type: 'projects', projectId: id })
  closeTopic(publicProjectTopic(id))
  return { ok: true }
})
