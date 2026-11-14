import type { LocationQuery, LocationQueryRaw } from 'vue-router'

// The address of a board and its task panel (Boss, 2026-11-11):
//   /projects/<projectId>                        the board
//   /projects/<projectId>/<taskId>               the board with that task's panel open
//   /projects/<projectId>/<taskId>/<commentId>   the same, for a comment (the comment part is optional)
// The old ?task=<id> form still opens the panel; the board page rewrites it to the path form. Pure, so the page and a
// script use one rule.

export function taskPanelPath(projectId: string, taskId?: string | null, commentId?: string | null): string {
  const board = `/projects/${encodeURIComponent(projectId)}`
  if (!taskId) return board
  const task = `${board}/${encodeURIComponent(taskId)}`
  return commentId ? `${task}/${encodeURIComponent(commentId)}` : task
}

// The query of the board without the old task parameter, so a view or a filter in the query is kept when the panel opens
// or closes.
export function queryWithoutTask(query: LocationQuery): LocationQueryRaw {
  return Object.fromEntries(Object.entries(query).filter(([key]) => key !== 'task')) as LocationQueryRaw
}

// The old deep link ?task=<id>[&comment=<id>] as the address the board goes to: the path form /projects/<id>/<task>, with
// the comment kept in the query (?comment=<id>) and every other query parameter kept. The panel reads the comment once and
// then removes it from the address, so a reload does not jump again. Null when the query has no task.
export function taskQueryAsPanelAddress(projectId: string, query: LocationQuery): { path: string, query: LocationQueryRaw } | null {
  const taskId = typeof query.task === 'string' ? query.task : ''
  if (!taskId) return null
  return { path: taskPanelPath(projectId, taskId), query: queryWithoutTask(query) }
}
