// Joins two pages of a task's comments (the window the permalink opened, and the earlier or later comments loaded
// after it) in order, without a comment twice. Each page is already oldest first; the page given first is the
// earlier one. Pure, so the comments store and a test use one rule.
export function mergeCommentPages<T extends { id: string }>(earlier: readonly T[], later: readonly T[]): T[] {
  const seen = new Set<string>()
  const merged: T[] = []
  for (const comment of [...earlier, ...later]) {
    if (seen.has(comment.id)) continue
    seen.add(comment.id)
    merged.push(comment)
  }
  return merged
}
