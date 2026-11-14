// The calendar's keyboard path (see tests/calendar-keys.test.ts): with a task selected, the arrow keys move its due day by
// the same number of days a drag would. Dates are board day strings (yyyy-MM-dd); the arithmetic is in UTC. Pure.

const KEY_DELTA: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

/** The days a key moves a selected task: left and right a day, up and down a week. Null for any other key. */
export function calendarKeyDelta(key: string): number | null {
  return key in KEY_DELTA ? KEY_DELTA[key]! : null
}

/** The due day after moving by `delta` days, or null when the task has no due day to move from. */
export function movedDueOn(dueOn: string | null | undefined, delta: number): string | null {
  if (!dueOn) return null
  const [y, m, d] = dueOn.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}
