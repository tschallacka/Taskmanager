// The link to a card, and to one comment on it, in the path form (owner, 2026-11-11): /projects/<id>/<task>[/<comment>].
// The Inbox, the board and the copy control use the same address. Pure, so the link rule is tested on its own.
import { taskPanelPath } from './taskPanelUrl'

/** The link to a task on its board, or to one comment of it when a comment id is given. */
export function taskLink(projectId: string, taskId: string, commentId?: string | null): string {
  return taskPanelPath(projectId, taskId, commentId)
}
