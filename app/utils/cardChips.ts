// The chips on a board card (redesign 4/9). Labels first, two of them and "+N"; then the state chips. A chip appears
// only with a reason, and a finished task shows none. Pure: the card component and the tests both use it.
import { dueDayToMs, isOverdueDay, todayIso } from './dueDate'

export type ChipTone = 'neutral' | 'warn' | 'danger'

export interface StateChip {
  key: 'overdue' | 'due-soon' | 'waits' | 'team-only' | 'shared'
  label: string
  tone: ChipTone
}

/** The first two labels on the card; the rest count as "+N". */
export const LABELS_SHOWN = 2

export function labelChipsOf(tags: string[]): { shown: string[], more: number } {
  return { shown: tags.slice(0, LABELS_SHOWN), more: Math.max(0, tags.length - LABELS_SHOWN) }
}

/** The local calendar day (`YYYY-MM-DD`) of a timestamp, for a due date read out of a description. */
export function dayOfMs(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A due day is "due soon" when it falls within two days, today included. Past days are overdue, not due soon. */
export function dueSoon(day: string, now = new Date()): boolean {
  if (isOverdueDay(day, now)) return false
  const days = Math.round((dueDayToMs(day) - dueDayToMs(todayIso(now))) / 86_400_000)
  return days >= 0 && days <= 2
}

export interface StateInput {
  done: boolean
  overdue: boolean
  dueSoon: boolean
  blocked: boolean
  /** How many open tasks this one waits for, when the viewer may see them; null when only the state is known. */
  blockedBy?: number | null
  visibility: 'internal' | 'customer' | undefined
  /** The board is filed under a customer. Only then does a customer-visible task read "Shared with customer". */
  customerBoard?: boolean
}

/** The state chips of a card, in their fixed order. Nothing for a finished task. */
export function stateChipsOf(input: StateInput): StateChip[] {
  if (input.done) return []
  const chips: StateChip[] = []
  if (input.overdue) chips.push({ key: 'overdue', label: 'Overdue', tone: 'danger' })
  else if (input.dueSoon) chips.push({ key: 'due-soon', label: 'Due soon', tone: 'warn' })
  if (input.blocked) {
    const count = input.blockedBy ?? null
    chips.push({ key: 'waits', label: count && count > 0 ? `Waits for ${count}` : 'Waits', tone: 'warn' })
  }
  if (input.visibility === 'internal') chips.push({ key: 'team-only', label: 'Team only', tone: 'warn' })
  else if (input.visibility === 'customer' && input.customerBoard) chips.push({ key: 'shared', label: 'Shared with customer', tone: 'neutral' })
  return chips
}
