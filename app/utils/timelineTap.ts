// The timeline's tap path (see tests/timeline-tap.test.ts): a menu on a task row lists the four moves. Each item is the action
// the keyboard path gives for the same keys (timelineKeys.ts), so a tap and a key land the same dates. Pure.

import { timelineKeyAction, type TimelineAction } from './timelineKeys'

export type TimelineTapItem = { id: 'move-earlier' | 'move-later' | 'end-earlier' | 'end-later', label: string }

export const TIMELINE_TAP_ITEMS: readonly TimelineTapItem[] = [
  { id: 'move-earlier', label: 'Move one day earlier' },
  { id: 'move-later', label: 'Move one day later' },
  { id: 'end-earlier', label: 'End one day earlier' },
  { id: 'end-later', label: 'End one day later' }
]

/** The action a menu item gives. Each item is the keyboard action for the same keys. */
export function tapItemAction(id: TimelineTapItem['id']): TimelineAction {
  const keys: Record<TimelineTapItem['id'], { key: string, shift: boolean }> = {
    'move-earlier': { key: 'ArrowLeft', shift: false },
    'move-later': { key: 'ArrowRight', shift: false },
    'end-earlier': { key: 'ArrowLeft', shift: true },
    'end-later': { key: 'ArrowRight', shift: true }
  }
  const { key, shift } = keys[id]
  const action = timelineKeyAction(key, { shift })
  if (!action) throw new Error(`no action for ${id}`)
  return action
}
