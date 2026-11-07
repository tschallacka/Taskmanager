import { requireCrewManager } from '../../utils/crewProvisioning'
import { crewTargets } from '../../utils/crewBoards'

/**
 * The teams and boards a crew can be bound to, for the key's owner: every team the owner runs as owner or
 * admin, each with its userboards (teams > userboards). The crew work boards and the shadow boards are left
 * out of the boards; a real board lists the shadow boards it has. Same gate as the crew API. A management
 * token sees only the team and the userboard of its own board.
 */
export default defineEventHandler(async (event) => {
  const caller = await requireCrewManager(event)
  return crewTargets(caller.userId, caller.boardId ?? undefined)
})
