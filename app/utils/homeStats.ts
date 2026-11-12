// The numbers on the home page (redesign 6/9): counted from the tasks the app already has, for one person. The day
// is the viewer's own calendar day (YYYY-MM-DD) and weekStart the timestamp of this week's Monday, local midnight.
import { isOverdueDay } from './dueDate'

export interface HomeTask {
  assigneeId?: string | null
  dueOn?: string | null
  completedAt?: number | null
}

export interface HomeStats {
  dueToday: number
  overdue: number
  doneThisWeek: number
}

export function homeStats(tasks: readonly HomeTask[], userId: string, today: string, weekStart: number): HomeStats {
  const mine = tasks.filter(task => task.assigneeId === userId)
  const open = mine.filter(task => task.completedAt == null)
  return {
    dueToday: open.filter(task => task.dueOn === today).length,
    overdue: open.filter(task => task.dueOn != null && isOverdueDay(task.dueOn, dayAt(today))).length,
    doneThisWeek: mine.filter(task => task.completedAt != null && task.completedAt >= weekStart).length
  }
}

// isOverdueDay compares with today's day; the viewer's day is passed in as a date, so a test can fix it.
function dayAt(today: string): Date {
  const [y, m, d] = today.split('-').map(Number)
  return new Date(y!, m! - 1, d!, 12)
}
