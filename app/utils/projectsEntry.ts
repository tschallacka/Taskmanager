// Where the projects page sends a person who has no board of their own. A customer contact or guest with no team goes
// to the shared list, never to the 'Your first project' form. Anyone else keeps the form.

export interface EntryInput {
  asksNew: boolean
  hasProjects: boolean
  teamCount: number
  contact: boolean
}

export function entryFor(input: EntryInput): string | null {
  if (input.asksNew || input.hasProjects || input.teamCount > 0) return null
  return input.contact ? '/shared-with-me' : null
}

/** One redirect at a time: a pending invitation comes before the shared list (the invitation has to be finished first). */
export function firstRedirect(contactTarget: string | null, inviteTarget: string | null): string | null {
  return inviteTarget ?? contactTarget
}

export interface FormGateInput {
  ready: boolean
  teamsPending: boolean
  teamsLoaded: boolean
  sharedLoaded: boolean
  redirecting: boolean
}

/**
 * The team list counts as loaded once it has data or has failed. Before its fetch starts, nothing is pending and the list is
 * empty: that is not yet a decision, so the form must not paint then.
 */
export function teamsLoaded(list: { data: unknown, error: unknown }): boolean {
  return list.data != null || list.error != null
}

/** The first-project form paints only once the page has decided to stay: everything loaded, and no redirect pending. */
export function mayShowFirstProjectForm(input: FormGateInput): boolean {
  return input.ready && !input.teamsPending && input.teamsLoaded && input.sharedLoaded && !input.redirecting
}

/** A redirect is pending while it has a target and its move has not failed (a failed team selection stays put). */
export function redirectPending(target: string | null, failed: boolean): boolean {
  return target !== null && !failed
}

/** The shared list counts as decided once its fetch has finished, even when the fetch failed. */
export function sharedDecided(status: 'idle' | 'pending' | 'success' | 'error'): boolean {
  return status === 'success' || status === 'error'
}
