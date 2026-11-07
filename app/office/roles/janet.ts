// Janet Janitor's route in the office. She walks to the desk of the worker whose card is being cleaned, then stands by
// or sweeps, as the cleanup tags on the card say. The tags are read by the shared piece's cleaningStateOf; the desk is
// the card's worker's desk, given by the scene. Janet's piece registers this planner under her key, once.
import { cleaningStateOf } from '../actor'
import type { CleaningState, RoutePlanner, WalkPlan } from '../actor'
import type { P } from '../layout'

export const JANITOR_KEY = 'janet'

/** Janet's state for a card's tags: walk, stand, sweep, or null when there is no cleanup to do. */
export function janetStateOf(tags: readonly string[]): CleaningState {
  return cleaningStateOf(tags)
}

/** Janet's walk for one state: to the desk she is working at, then what she does there. Null when there is no desk. */
export function janetPlan(state: NonNullable<CleaningState>, desk: P | null): WalkPlan | null {
  if (!desk) return null
  if (state === 'sweep') return { points: [desk], then: 'sweep' }
  return { points: [desk], then: 'stand' }
}

/**
 * The planner the registry holds for Janet. The registry asks by state only, so the desk is read through `deskOf`,
 * which the scene sets from the card it is showing before the walk starts.
 */
export function janetPlanner(deskOf: () => P | null): RoutePlanner {
  return state => janetPlan(state, deskOf())
}
