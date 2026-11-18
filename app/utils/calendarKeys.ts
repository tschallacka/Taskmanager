// The calendar's keyboard path (see tests/calendar-keys.test.ts): with a task selected, the arrow keys move its due day by
// the same number of days a drag would. This file only maps keys to days; the day arithmetic is dateNudge.ts. Pure.

const KEY_DELTA: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

/** The days a key moves a selected task: left and right a day, up and down a week. Null for any other key. */
export function calendarKeyDelta(key: string): number | null {
  return key in KEY_DELTA ? KEY_DELTA[key]! : null
}
