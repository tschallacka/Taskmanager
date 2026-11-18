// The links an agent hands to a person: the same paths the app's routes use (notifications.ts builds the task link the
// Inbox shows, taskComments.ts the update link). One helper builds them for the MCP, the notifications and the REST
// answers, so the three cannot drift apart. The origin is the instance's own, from BETTER_AUTH_URL. Every absolute link
// is the origin plus one of the path builders below; nothing else writes an app path.

/** The origin of this instance, without a trailing slash. */
export function shareOrigin(): string {
  return (process.env.BETTER_AUTH_URL || 'http://localhost:3000').replace(/\/$/, '')
}

/** The path of a board. */
export function boardPath(boardId: string): string {
  return `/projects/${boardId}`
}

/** The path of a task: opens the task's panel on its board. */
export function taskPath(boardId: string, taskId: string): string {
  return `${boardPath(boardId)}?task=${taskId}`
}

/** The path of a conversation (a message thread on the board's messages view). */
export function messagePath(boardId: string, messageId: string): string {
  return `${boardPath(boardId)}?view=messages&message=${messageId}`
}

/** The path of one update of a task: opens the task at that update. */
export function updatePath(boardId: string, taskId: string, updateId: string): string {
  return `${taskPath(boardId, taskId)}&comment=${updateId}`
}

/**
 * The id of the task a link opens. A subtask has no panel of its own: the app's drawer finds only the board's own
 * tasks, so a link to a subtask would open nothing. The subtask is listed in its parent's panel, so its link is its
 * parent's.
 */
export function openableTaskId(task: { id: string, parentTaskId?: string | null }): string {
  return task.parentTaskId ?? task.id
}

/** The absolute link to a board. */
export function boardShareUrl(boardId: string): string {
  return `${shareOrigin()}${boardPath(boardId)}`
}

/** The absolute link to a task: opens the task's panel on its board. */
export function taskShareUrl(boardId: string, taskId: string): string {
  return `${shareOrigin()}${taskPath(boardId, taskId)}`
}

/** The absolute link to a shared board's public page (/public/project/<id>), the page a customer can open without a sign-in. */
export function publicBoardShareUrl(boardId: string): string {
  return `${shareOrigin()}/public/project/${boardId}`
}

/** The absolute link to a conversation (a message thread on the board's messages view). */
export function messageShareUrl(boardId: string, messageId: string): string {
  return `${shareOrigin()}${messagePath(boardId, messageId)}`
}

/**
 * The link an inbox notification opens: its task, else its message thread, else its board. The same choice the
 * app's notificationLink makes (notifications.ts builds the e-mail and push link from the same rule).
 */
export function notificationShareUrl(boardId: string, target: { taskId?: string | null, messageId?: string | null } = {}): string {
  if (target.taskId) return taskShareUrl(boardId, target.taskId)
  if (target.messageId) return messageShareUrl(boardId, target.messageId)
  return boardShareUrl(boardId)
}

/** The absolute link to one update of a task: opens the task at that update. */
export function updateShareUrl(boardId: string, taskId: string, updateId: string): string {
  return `${shareOrigin()}${updatePath(boardId, taskId, updateId)}`
}
