import { requireProject } from '../../../utils/projects'
import { isWatching } from '../../../utils/projectWatchers'

// Whether the caller asked to be notified when tasks are added to this board.
export default defineEventHandler(async (event) => {
  const project = await requireProject(event, getRouterParam(event, 'id')!)
  return { watching: await isWatching(project.id, event.context.session.user.id) }
})
