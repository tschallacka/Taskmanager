// The timeline's tap path (see tests/timeline-tap.test.ts): a menu on a task row lists the four moves. Each item is the action
// the keyboard path gives for the same keys (timelineKeys.ts), so a tap and a key land the same dates. Pure.

import type { TimelineAction } from './timelineKeys'

export type TimelineTapItem = { id: 'move-earlier' | 'move-later' | 'end-earlier' | 'end-later', label: string }

export const TIMELINE_TAP_ITEMS: readonly TimelineTapItem[] = [
  { id: 'move-earlier', label: 'Move one day earlier' },
  { id: 'move-later', label: 'Move one day later' },
  { id: 'end-earlier', label: 'End one day earlier' },
  { id: 'end-later', label: 'End one day later' }
]

// The action each item gives: the same as the keyboard action for the same keys (ArrowLeft and ArrowRight, with Shift for the
// end), written out here so the menu does not depend on the key names.
const ACTIONS: Record<TimelineTapItem['id'], TimelineAction> = {
  'move-earlier': { mode: 'move', delta: -1 },
  'move-later': { mode: 'move', delta: 1 },
  'end-earlier': { mode: 'end', delta: -1 },
  'end-later': { mode: 'end', delta: 1 }
}

/** The action a menu item gives. */
export function tapItemAction(id: TimelineTapItem['id']): TimelineAction {
  return ACTIONS[id]
}
