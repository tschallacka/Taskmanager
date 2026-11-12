// The link to a card, and to one comment on it. The inbox and the board use the same path: a card opens with ?task=, and a
// comment is named with &comment=, which the task's comments read to scroll to it and highlight it. Pure, so the link rule
// is tested on its own.

/** The link to a task on its board, or to one comment of it when a comment id is given. */
export function taskLink(projectId: string, taskId: string, commentId?: string | null): string {
  const base = `/projects/${projectId}?task=${taskId}`
  return commentId ? `${base}&comment=${commentId}` : base
}
