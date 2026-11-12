// The kind icon, the health tint and the open count of a board row. The project list and the rail both draw
// these, so they come from this one module and cannot drift apart.

export type ProjectKind = 'crew_board' | 'crew_home' | 'customer_board' | 'board'

export interface KindedProject {
  role?: string | null
  customerId?: string | null
  status?: string | null
}

const KIND_ICON: Record<ProjectKind, string> = {
  crew_board: 'i-lucide-users-round',
  crew_home: 'i-lucide-house',
  customer_board: 'i-lucide-building-2',
  board: 'i-lucide-kanban'
}

const HEALTH_TINT: Record<string, string> = {
  on_track: 'text-success',
  at_risk: 'text-warning',
  off_track: 'text-error'
}

/** The kind of a board: a crew's shadow board, a crew home, a customer's board, or an ordinary board. */
export function projectKind(project: KindedProject): ProjectKind {
  if (project.role === 'shadow') return 'crew_board'
  if (project.role === 'crew_home') return 'crew_home'
  if (project.customerId) return 'customer_board'
  return 'board'
}

export function kindIcon(project: KindedProject): string {
  return KIND_ICON[projectKind(project)]
}

/** The tint of the icon and the open count: the board's health, the open board's accent when it is the active one. */
export function healthTint(project: KindedProject, active = false): string {
  if (active) return 'text-primary'
  return HEALTH_TINT[project.status ?? ''] ?? 'text-dimmed'
}

/** Open and total tasks per board. A task is open while its column is not one of the board's finishing columns. */
export function countOpenTasks(
  tasks: { projectId: string, columnId: string }[],
  terminalColumnIds: Map<string, Set<string>>
): Map<string, { open: number, total: number }> {
  const counts = new Map<string, { open: number, total: number }>()
  for (const task of tasks) {
    const entry = counts.get(task.projectId) ?? { open: 0, total: 0 }
    entry.total++
    if (!terminalColumnIds.get(task.projectId)?.has(task.columnId)) entry.open++
    counts.set(task.projectId, entry)
  }
  return counts
}
