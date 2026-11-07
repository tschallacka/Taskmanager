// Rita Reporter's piece of the route registry: she walks to her typewriter while a status report is due (once an hour)
// or while minutes are owed for a meeting that said "meeting over:", and types there. Her badge is the minutes owed.
import { routes } from '../actor'
import type { P } from '../layout'

export const STATUS_EVERY_MS = 60 * 60 * 1000
export const MEETING_OVER = 'meeting over:'

/** Where the typewriter stands: on the desk at the back of the room, by the window. Provisional until the screenshots. */
export const TYPEWRITER: P = { x: 9.5, z: -10.2 }

/** Whether an hour has passed since the last status report (or none has been posted yet). */
export function statusDue(lastReportAt: number | null, now: number): boolean {
  return lastReportAt === null || now - lastReportAt >= STATUS_EVERY_MS
}

/** Whether a channel line closes a meeting, so its minutes are owed. */
export function closesMeeting(line: string): boolean {
  return line.toLowerCase().includes(MEETING_OVER)
}

export interface RitaData {
  lastReportAt: number | null
  /** Meetings that closed with "meeting over:" and have no minutes yet. */
  minutesOwed: number
  now: number
}

export interface RitaState {
  minutesOwed: number
}

routes.register<RitaData, RitaState>('rita', {
  stateOf: (data) => {
    const typing = data.minutesOwed > 0 || statusDue(data.lastReportAt, data.now)
    return typing ? { minutesOwed: data.minutesOwed } : null
  },
  plan: state => ({
    points: [TYPEWRITER],
    then: 'stand',
    ...(state.minutesOwed > 0 ? { badge: state.minutesOwed } : {})
  })
})
