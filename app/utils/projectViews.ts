// The board's view row: the pages that sit under "More" (Overview, Messages, Time, Files, as the owner's design page06
// says) and the views that stay as tabs. Pure, so the row and a test use one rule. A view this list does not know is a
// tab, so a new page is never hidden; a More page is always under More, wherever it sits in the views.

export const MORE_VIEW_KEYS: readonly string[] = ['overview', 'messages', 'time', 'files']

export function splitProjectViews<T extends { key: string }>(views: readonly T[]): { primary: T[], more: T[] } {
  const primary: T[] = []
  const more: T[] = []
  for (const view of views) {
    if (MORE_VIEW_KEYS.includes(view.key)) more.push(view)
    else primary.push(view)
  }
  // The More group keeps the order the design gives it, not the order the views came in.
  more.sort((a, b) => MORE_VIEW_KEYS.indexOf(a.key) - MORE_VIEW_KEYS.indexOf(b.key))
  return { primary, more }
}
