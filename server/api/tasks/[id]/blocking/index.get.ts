import { requireTask } from '../../../../utils/projects'
import { blockingFor } from '../../../../utils/taskDependencyService'

// The tasks that wait for this one (the inverse of blockers), for a caller who may see the task. The same access rules
// as the blockers route: a customer sees only the customer-visible waiting tasks by title, and a count of the rest.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { task, project } = await requireTask(event, id)
  const viewer = { userId: event.context.session.user.id, audience: project.audience }
  return blockingFor(task.id, task.projectId, viewer, task.columnId, task.completedAt ?? null, task.deletedAt ?? null)
})
