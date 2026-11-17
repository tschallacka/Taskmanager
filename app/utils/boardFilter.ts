// The board's Filter: the labels a card must carry, one assignee, and the search in this board.
// Kept apart from the composable so the rule can be tested on plain objects.

/** The assignee filter's value for "Unassigned": a card with nobody on it. */
export const UNASSIGNED = ''

export interface BoardFilter {
  /** Every label here must be on the card. */
  labels: string[]
  /** null: no assignee filter. UNASSIGNED: only cards with nobody on them. Otherwise one person's id. */
  assigneeId: string | null
  /** The cards whose title has this text, in any case. Blank means no search. */
  search: string
}

export interface FilterableTask {
  title: string
  tags: string[]
  // A task from the API may leave the field out; a missing assignee is nobody, the same as null.
  assigneeId?: string | null
}

/** True when any part of the Filter is on: the labels, the assignee or a search. */
export function isBoardFiltering(filter: BoardFilter): boolean {
  return filter.labels.length > 0 || filter.assigneeId !== null || filter.search.trim() !== ''
}

/** Whether a card stays on the board under this Filter. */
export function matchesBoardFilter(task: FilterableTask, filter: BoardFilter): boolean {
  if (!filter.labels.every(tag => task.tags.includes(tag))) return false
  if (filter.assigneeId === UNASSIGNED) {
    if (task.assigneeId) return false
  } else if (filter.assigneeId !== null && task.assigneeId !== filter.assigneeId) {
    return false
  }
  const needle = filter.search.trim().toLowerCase()
  return needle === '' || task.title.toLowerCase().includes(needle)
}
