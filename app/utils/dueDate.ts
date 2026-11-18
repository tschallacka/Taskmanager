// A task's due date is a calendar day (`YYYY-MM-DD`), read in the viewer's own
// timezone: due on the 3rd means the 3rd wherever the board is opened.

/** The local calendar day (`YYYY-MM-DD`) of a timestamp. The one place a day is written as text. */
export function dayOfMs(ms: number): string {
  const now = new Date(ms)
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Today as `YYYY-MM-DD` in local time. */
export function todayIso(now = new Date()): string {
  return dayOfMs(now.getTime())
}

/** Local midnight of a due day, for the date labels that take a timestamp. */
export function dueDayToMs(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y!, m! - 1, d!).getTime()
}

/** Overdue once the day itself has passed; due today is not late yet. */
export function isOverdueDay(day: string, now = new Date()): boolean {
  return day < todayIso(now)
}
