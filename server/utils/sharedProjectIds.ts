// The projects shared with a customer contact: the customer's own projects and the boards the person holds as a
// guest. A project that is both counts once, first in the order it was given.

export function sharedProjectIds(customerProjectIds: string[], guestProjectIds: string[]): string[] {
  return [...new Set([...customerProjectIds, ...guestProjectIds])]
}
