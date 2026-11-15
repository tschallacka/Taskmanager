// The date rule for moving a timeline bar by a number of days, for a keyboard or a tap as well as a pointer drag. The
// timeline's drag and its keys both use this, so the same number of days lands a bar in the same place. Dates are the
// board's own day strings (yyyy-MM-dd), and the arithmetic is in UTC so no time zone can shift a day. Pure.

export type DayRange = { startOn?: string | null, dueOn?: string | null }
export type NudgeMode = 'move' | 'start' | 'end'
export type NudgePatch = { startOn?: string, dueOn?: string }

function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// A bar runs from the start date to the due date; a task with only one of them is a single day.
function spanOf(task: DayRange): { from: string, to: string } | null {
  const from = task.startOn ?? task.dueOn
  const to = task.dueOn ?? task.startOn
  return from && to ? { from, to } : null
}

/**
 * The dates to save after moving a task's bar by `delta` days. `move` shifts the whole bar and keeps its length (only the
 * dates the task has are saved). `start` and `end` move one edge; an edge stops at the other one, so a bar can shrink to
 * one day but never turn inside out. A task with no dates gives an empty patch.
 */
export function nudgePatch(task: DayRange, mode: NudgeMode, delta: number): NudgePatch {
  const span = spanOf(task)
  if (!span) return {}
  if (mode === 'move') {
    const patch: NudgePatch = {}
    if (task.startOn) patch.startOn = addDays(span.from, delta)
    if (task.dueOn) patch.dueOn = addDays(span.to, delta)
    return patch
  }
  if (mode === 'start') {
    const moved = addDays(span.from, delta)
    return { startOn: moved > span.to ? span.to : moved }
  }
  const moved = addDays(span.to, delta)
  return { dueOn: moved < span.from ? span.from : moved }
}
