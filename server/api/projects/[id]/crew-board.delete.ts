import { crewShadowToDelete, deleteCrewBoard } from '../../../utils/crewBoards'
import { closeTopic, publicProjectTopic, publishFromEvent } from '../../../utils/realtime'

// Deletes a crew's shadow board for good, with its tasks, its forked accounts and the crew's link to the real board. The
// rule is crewShadowToDelete's: the board's owner, the team member its crew is coupled to, an owner or admin of its team,
// or the instance admin may; a crew account never. A board that is not a crew's shadow is not found here, and a shadow
// the person may not see is not found either (the instance admin excepted). DELETE /api/projects/:id does the same.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await crewShadowToDelete(event.context.session.user.id, id)
  await deleteCrewBoard(id)
  await publishFromEvent(event, { type: 'projects', projectId: id })
  closeTopic(publicProjectTopic(id))
  return { ok: true }
})
