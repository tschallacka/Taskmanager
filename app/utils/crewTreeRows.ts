// The rows of the board list's crew tree, in the order the sidebar draws them. A real board with crew shadows gets an
// arrow, and its shadows are drawn under it only while it is open. The arrow and the nested rows come from this one
// computation, so they cannot disagree: a row is nested exactly when its real board's arrow points down.

export interface TreeProject {
  id: string
  role?: 'board' | 'real' | 'shadow' | 'crew_home'
  realBoard?: { id: string } | null
}

export interface TreeRow<P extends TreeProject> {
  /** Unique within the list: a board appears once, so a key built from it never collides. */
  key: string
  project: P
  depth: 0 | 1
  /** How many crew shadows this board has under it (0 when it has none, so no arrow). */
  shadowCount: number
  /** Whether this board's arrow points down. Only meaningful when shadowCount > 0. */
  open: boolean
}

/**
 * The tree rows for `projects`, in list order. A shadow whose real board is in the list is drawn under that board
 * (and not on its own); a shadow whose real board is not in the list stays a top-level row. `openIds` are the real
 * boards whose arrow points down.
 */
export function crewTreeRows<P extends TreeProject>(projects: P[], openIds: readonly string[]): TreeRow<P>[] {
  const listed = new Set(projects.map(project => project.id))
  const rows: TreeRow<P>[] = []
  for (const project of projects) {
    if (project.role === 'shadow' && project.realBoard && listed.has(project.realBoard.id)) continue
    const children = projects.filter(child => child.role === 'shadow' && child.realBoard?.id === project.id)
    const open = children.length > 0 && openIds.includes(project.id)
    rows.push({ key: `top-${project.id}`, project, depth: 0, shadowCount: children.length, open })
    if (open) {
      for (const child of children) rows.push({ key: `nested-${child.id}`, project: child, depth: 1, shadowCount: 0, open: false })
    }
  }
  return rows
}
