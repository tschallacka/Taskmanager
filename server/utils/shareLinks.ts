// The links an agent hands to a person: the same paths the app's routes use (notifications.ts builds the task link the
// Inbox shows, taskComments.ts the update link). One helper builds them for the MCP, the notifications and the REST
// answers, so the three cannot drift apart. The origin is the instance's own, from BETTER_AUTH_URL.

/** The origin of this instance, without a trailing slash. */
export function shareOrigin(): string {
  return (process.env.BETTER_AUTH_URL || 'http://localhost:3000').replace(/\/$/, '')
}

/** The absolute link to a board. */
export function boardShareUrl(boardId: string): string {
  return `${shareOrigin()}/projects/${boardId}`
}

/** The absolute link to a task: opens the task's panel on its board. */
export function taskShareUrl(boardId: string, taskId: string): string {
  return `${boardShareUrl(boardId)}?task=${taskId}`
}

/** The absolute link to one update of a task: opens the task at that update. */
export function updateShareUrl(boardId: string, taskId: string, updateId: string): string {
  return `${taskShareUrl(boardId, taskId)}&comment=${updateId}`
}
