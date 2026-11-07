// Rita Reporter's state, from the crew's clock and channel: she types at her typewriter while a status report is due
// (once an hour) or while the minutes of a meeting that said "meeting over:" are still to be written. Pure: no renderer,
// no database, so it is tested on its own. The walk itself is in rita.ts.
import type { P } from '../layout'

export const STATUS_EVERY_MS = 60 * 60 * 1000
export const MEETING_OVER = 'meeting over:'

export type RitaState = 'type' | null

/** Whether an hour has passed since the last status report (or none has been posted yet). */
export function statusDue(lastReportAt: number | null, now: number): boolean {
  return lastReportAt === null || now - lastReportAt >= STATUS_EVERY_MS
}

/** Whether a channel line closes a meeting, so its minutes are owed. */
export function closesMeeting(line: string): boolean {
  return line.toLowerCase().includes(MEETING_OVER)
}

/** Rita types while a report is due or minutes are owed; otherwise she is off duty at her desk. */
export function ritaStateOf(input: { lastReportAt: number | null, minutesOwed: number, now: number }): RitaState {
  if (input.minutesOwed > 0) return 'type'
  return statusDue(input.lastReportAt, input.now) ? 'type' : null
}

/** Where the typewriter stands: on the desk at the back of the room, by the window. */
export const TYPEWRITER: P = { x: 9.5, z: -10.2 }

/** Rita walks to her typewriter while she has a report or minutes to write, then types at it. */
export function ritaPlan(state: RitaState): { points: P[], then: 'stand' | 'none' } | null {
  return state ? { points: [TYPEWRITER], then: 'stand' } : null
}
