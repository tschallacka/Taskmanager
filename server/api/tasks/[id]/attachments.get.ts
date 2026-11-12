import { existsSync, readdirSync } from 'fs'
import { requireTask } from '../../../utils/projects'
import { SAFE_FILENAME, MAX_ATTACHMENTS, taskAttachmentDir } from '../../../utils/attachments'

// The images a task holds, for the task panel's Attachments list. Anyone who can open the task may read the list;
// only staff see the delete control.
export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')!
  const { task } = await requireTask(event, taskId)

  const dir = taskAttachmentDir(task.id)
  const names = existsSync(dir) ? readdirSync(dir).filter(name => SAFE_FILENAME.test(name)).sort() : []
  return {
    max: MAX_ATTACHMENTS,
    attachments: names.map(name => ({ name, url: `/api/attachments/tasks/${task.id}/${name}` }))
  }
})
