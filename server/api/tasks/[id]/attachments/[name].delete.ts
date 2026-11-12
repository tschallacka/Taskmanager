import { requireStaff, requireTask } from '../../../../utils/projects'
import { deleteTaskAttachment, taskAttachmentDir } from '../../../../utils/attachments'

// Removes one image of a task, by its stored name. Staff of the board only (a customer contact cannot). The other
// files of the task stay, and the count drops by one.
export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')!
  const name = getRouterParam(event, 'name')!
  const { task, project } = await requireTask(event, taskId)
  requireStaff(project)

  const removed = deleteTaskAttachment(taskAttachmentDir(task.id), name)
  if (!removed) throw createError({ statusCode: 404, message: 'No such attachment on this task' })

  return { ok: true }
})
