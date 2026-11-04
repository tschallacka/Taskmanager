import { requireProject } from '../../../utils/projects'
import { setWatching } from '../../../utils/projectWatchers'

// Turns "notify me when tasks are added" on or off for the caller. Anyone who can open the board may,
// including a guest: they are told only of the tasks they may read.
export default defineEventHandler(async (event) => {
  const project = await requireProject(event, getRouterParam(event, 'id')!)
  const body = (await readBody<{ watching?: unknown }>(event)) ?? {}
  if (typeof body.watching !== 'boolean') throw createError({ statusCode: 400, message: 'Say whether to watch the board' })
  await setWatching(project.id, event.context.session.user.id, body.watching)
  return { watching: body.watching }
})
