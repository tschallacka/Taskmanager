// The groups of the projects shared with a person. A group is keyed by the id of what shares it (a customer, or the
// team a board belongs to), never by its name, so two organisations with the same name stay two groups.

/** The name of the group for boards that belong to no team: one constant for the page and the server. */
export const SHARED_FALLBACK_LABEL = 'Shared with you'

export function groupKey(kind: 'customer' | 'team' | 'guest', id: string): string {
  return `${kind}:${id}`
}
