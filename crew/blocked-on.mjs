// The BLOCKED ON line of a card in Blocked (CREW.md, the release flow, item 7): an update that starts `BLOCKED ON <key>:
// <what is needed>`. Susy reads it to know whom to poke. This module only reads the updates (newest first) and says which
// Blocked cards have no such line, so the poke check is a pure answer that the server or Susy can call. It does not post
// or move anything.

const LINE = /^BLOCKED ON ([a-z][a-z0-9]*):\s*(\S.*)$/

/**
 * The key and the need from the newest `BLOCKED ON` update of a card, or null when there is none. `updates` are the
 * card's updates, newest first, each with a `body`. A line is read from the first line of the body only.
 */
export function blockedOnOf(updates) {
  for (const update of updates ?? []) {
    const first = String(update?.body ?? '').split('\n')[0].trim()
    const match = LINE.exec(first)
    if (match) return { key: match[1], need: match[2].trim() }
  }
  return null
}

/**
 * The Blocked cards with no BLOCKED ON line, for a finding: each names the card and its column. A card whose column is
 * not Blocked is left out. `cards` are { id, column, updates }.
 */
export function blockedWithoutLine(cards) {
  return (cards ?? [])
    .filter(card => card.column === 'Blocked' && blockedOnOf(card.updates) === null)
    .map(card => ({ id: card.id, column: card.column }))
}
