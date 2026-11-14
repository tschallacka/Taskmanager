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

// A comment in the address opens the phone's Activity sheet at first, since the sheet hides the thread until it is open
// (display:none), and a permalink's window buttons and comment would otherwise have no box.
export function activityStartsOpen(comment: unknown): boolean {
  return typeof comment === 'string' && comment !== ''
}

// The query of the board without the old task parameter, so a view or a filter in the query is kept when the panel opens
// or closes.
export function queryWithoutTask(query: LocationQuery): LocationQueryRaw {
  return Object.fromEntries(Object.entries(query).filter(([key]) => key !== 'task')) as LocationQueryRaw
}
