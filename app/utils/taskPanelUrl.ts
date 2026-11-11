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
export function queryWithoutTask(query: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(query).filter(([key]) => key !== 'task'))
}
