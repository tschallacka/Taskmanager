// The address of one task on its board: /projects/<board-id>/<task-id>. Opening a task writes it to the
// address bar, Copy link copies it (with the origin in front), and a pasted address names the task again.
// Pure, with no imports, so the page, the menus and the server share one builder.

/** The path of a task on its board, with both ids encoded. */
export function taskAddress(boardId: string, taskId: string): string {
  return `/projects/${encodeURIComponent(boardId)}/${encodeURIComponent(taskId)}`
}

/** The board and task a path names in the form taskAddress builds. Null for any other path. */
export function parseTaskAddress(pathname: string): { boardId: string, taskId: string } | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length !== 3 || parts[0] !== 'projects') return null
  return { boardId: decodeURIComponent(parts[1]!), taskId: decodeURIComponent(parts[2]!) }
}

/** What the board says when an address names a task the person cannot see, or that is gone. */
export const MISSING_TASK_NOTE = 'This task is not on this board, or you cannot see it.'
