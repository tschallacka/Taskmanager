// The calendar's tap path (see tests/calendar-tap.test.ts): a task is picked with its Move control, and a tap on a day puts
// it there. Pure, so the view and a test use one rule. Day strings are yyyy-MM-dd.

/** Picks a task, or clears the pick when that task is already picked. */
export function togglePick(picked: string | null, taskId: string): string | null {
  return picked === taskId ? null : taskId
}

/** The move a tap on a day gives: the picked task to that day. Null when nothing is picked, the task is gone, or it is already on that day. */
export function dayTapMove(
  picked: string | null,
  dayIso: string,
  tasks: readonly { id: string, dueOn?: string | null }[]
): { id: string, dueOn: string } | null {
  if (!picked) return null
  const task = tasks.find(t => t.id === picked)
  if (!task || task.dueOn === dayIso) return null
  return { id: picked, dueOn: dayIso }
}
