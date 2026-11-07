// Janet Janitor's piece of the route registry: she walks to the desk of the worker whose leftovers she cleans, stands
// by while the plan waits for the checker, and sweeps once the steps are granted. Her state is her cleanup state.
import { cleaningStateOf, routes } from '../actor'

export interface JanetData {
  tags: readonly string[]
  worker: string
}

export interface JanetState {
  state: 'walk' | 'stand' | 'sweep'
  worker: string
}

routes.register<JanetData, JanetState>('janet', {
  stateOf: (data) => {
    const state = cleaningStateOf(data.tags)
    return state ? { state, worker: data.worker } : null
  },
  plan: ({ state, worker }) => routes.walkToDesk(worker, state === 'walk' ? 'none' : state)
})
