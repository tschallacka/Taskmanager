import { requireTask } from '../../utils/projects'

// The card ids in a text (an inbox item, a board message, a comment) that the reader may open, each with its board and
// title. An id the reader may not open is left out, so the answer never tells that a hidden card exists.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ ids?: unknown }>(event)
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === 'string' && /^mw[a-z0-9]{16,24}$/.test(id)))].slice(0, 100)
    : []

  const tasks: Record<string, { projectId: string, title: string }> = {}
  for (const id of ids) {
    try {
      const { task } = await requireTask(event, id)
      tasks[id] = { projectId: task.projectId, title: task.title }
    } catch {
      // Not found, not in a board the reader belongs to, or no session: the id stays plain text.
    }
  }
  return { tasks }
})
