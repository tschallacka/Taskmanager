// Janet Janitor's piece of the route registry: she walks in at the delivery door when a card is ready to clean, walks to
// the desk of the worker whose leftovers she cleans, stands by while the plan waits for the checker, and sweeps at the
// desk once the steps are granted. Her badge counts what she cleaned since the office last looked. Her state is her
// cleanup state. The one registration under 'janet' is here; nothing else registers her.
import { cleaningStateOf, routes } from '../actor'
import type { WalkPlan } from '../actor'
import { DELIVERY_DOOR_Z, ROOM } from '../layout'
import type { P } from '../layout'

/** Where Janet comes in: just inside the delivery door, the way the courier's parcels come in. */
export const JANITOR_DOOR: P = { x: ROOM.maxX - 1.2, z: DELIVERY_DOOR_Z }
/** How long she stops at a desk before she starts, and how long she sweeps there (seconds). */
export const ARRIVE_SECONDS = 2
export const SWEEP_SECONDS = 4

export interface JanetData {
  tags: readonly string[]
  worker: string
  /** Cards she cleaned since the office last looked: the badge at her desk. Zero or missing shows no badge. */
  cleanedSinceLook?: number
}

export interface JanetState {
  state: 'walk' | 'stand' | 'sweep'
  worker: string
  badge?: number
}

function badgeOf(count: number | undefined): number | undefined {
  return count && count > 0 ? count : undefined
}

/**
 * Janet's plan for one state. A ready card is a walk in at the delivery door, then to the desk, then a short stop; a
 * waiting plan stands at the desk; a granted one sweeps there. Null when the office has no desk for the worker.
 */
export function janetPlanFor(state: JanetState): WalkPlan | null {
  const badge = badgeOf(state.badge)
  const extra = badge === undefined ? {} : { badge }
  if (state.state === 'walk') {
    const desk = routes.deskOf(state.worker)
    if (!desk) return null
    return { points: [JANITOR_DOOR, desk], then: 'none', stopSeconds: ARRIVE_SECONDS, ...extra }
  }
  if (state.state === 'sweep') return routes.walkToDesk(state.worker, 'sweep', { stopSeconds: SWEEP_SECONDS, ...extra })
  return routes.walkToDesk(state.worker, 'stand', extra)
}

routes.register<JanetData, JanetState>('janet', {
  stateOf: (data) => {
    const state = cleaningStateOf(data.tags)
    return state ? { state, worker: data.worker, badge: data.cleanedSinceLook } : null
  },
  plan: janetPlanFor
})
