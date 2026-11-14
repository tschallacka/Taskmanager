// A window of a task's comments around one comment, for a permalink: 5 before, the comment, 5 after, with counts
// of what is left on each side. The rows are the comments the reader may already see, oldest first, so the window
// is counted over what that reader can read (a customer gets only shared comments). Pure: no database here.

export const WINDOW_SIDE = 5

export interface WindowRow {
  id: string
  createdAt: number
}

export interface CommentWindow<T> {
  comments: T[]
  hasEarlier: boolean
  earlierCount: number
  hasLater: boolean
  laterCount: number
}

function indexOfId<T extends WindowRow>(rows: T[], id: string): number {
  return rows.findIndex(row => row.id === id)
}

/** The comment itself, up to WINDOW_SIDE before it and after it. Throws the same 404 as an unknown comment. */
export function aroundComment<T extends WindowRow>(rows: T[], commentId: string, side = WINDOW_SIDE): CommentWindow<T> {
  const at = indexOfId(rows, commentId)
  if (at < 0) throw notFound()
  const start = Math.max(0, at - side)
  const end = Math.min(rows.length - 1, at + side)
  return {
    comments: rows.slice(start, end + 1),
    hasEarlier: start > 0,
    earlierCount: start,
    hasLater: end < rows.length - 1,
    laterCount: rows.length - 1 - end
  }
}

/** Every comment before the given one (the "load earlier comments" step). Nothing is left after it. */
export function allEarlierThan<T extends WindowRow>(rows: T[], commentId: string): CommentWindow<T> {
  const at = indexOfId(rows, commentId)
  if (at < 0) throw notFound()
  return {
    comments: rows.slice(0, at),
    hasEarlier: false,
    earlierCount: 0,
    hasLater: true,
    laterCount: rows.length - at
  }
}

/** Every comment after the given one (the "show later comments" step). Nothing is left before it. */
export function allLaterThan<T extends WindowRow>(rows: T[], commentId: string): CommentWindow<T> {
  const at = indexOfId(rows, commentId)
  if (at < 0) throw notFound()
  return {
    comments: rows.slice(at + 1),
    hasEarlier: true,
    earlierCount: at + 1,
    hasLater: false,
    laterCount: 0
  }
}

function notFound() {
  // Nitro provides createError as a global; the route throws the same shape for every unknown or hidden id.
  return createError({ statusCode: 404, message: 'Comment not found' })
}
