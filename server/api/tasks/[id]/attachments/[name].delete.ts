import { requireStaff, requireTask } from '../../../../utils/projects'
import { deleteTaskAttachment, taskAttachmentDir } from '../../../../utils/attachments'
import { logActivity } from '../../../../utils/taskActivity'

// Removes one image of a task, by its stored name. Staff of the board only (a customer contact cannot). On a crew's
// read-only shadow board requireProject refuses this non-read request before it gets here. The other files of the
// task stay, the count drops by one, and the activity says that an attachment was removed.
export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')!
  const name = getRouterParam(event, 'name')!
  const { task, project } = await requireTask(event, taskId)
  requireStaff(project)

  const removed = deleteTaskAttachment(taskAttachmentDir(task.id), name)
  if (!removed) throw createError({ statusCode: 404, message: 'No such attachment on this task' })

  await logActivity(task, event.context.session.user.id, [{ kind: 'attachment_removed' }], 'ui')
  return { ok: true }
})
