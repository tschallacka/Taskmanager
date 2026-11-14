// The keyboard path for a timeline bar (see tests/timeline-keys.test.ts): the arrow keys move a focused bar one day, Shift
// with an arrow changes its end, and Alt with an arrow changes its start. The result feeds nudgePatch (dateNudge.ts), the
// same rule the pointer drag uses. Pure.

import type { NudgeMode } from './dateNudge'

export type TimelineKeys = { shift?: boolean, alt?: boolean }
export type TimelineAction = { mode: NudgeMode, delta: number }

/** What a key does to a focused timeline bar, or null when it does nothing there. */
export function timelineKeyAction(key: string, keys: TimelineKeys): TimelineAction | null {
  const delta = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0
  if (!delta) return null
  if (keys.alt) return { mode: 'start', delta }
  if (keys.shift) return { mode: 'end', delta }
  return { mode: 'move', delta }
}
