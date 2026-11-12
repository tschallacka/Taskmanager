// Card ids in a message, a comment or a description become links, but only for a card the reader may open: an id the
// reader may not open stays plain text, so the link never tells a reader that a hidden card exists. Pure, so the inbox,
// the task panel and the board messages all split text the same way.

/** A card id as the app writes them: "mw" and 16 to 24 letters or digits, as in mwasus18611939jk1av. */
export const CARD_ID_PATTERN = /\bmw[a-z0-9]{16,24}\b/g

export type TextPiece = { text: string } | { id: string, openable: true }

/**
 * Splits `text` into plain pieces and card ids. `mayOpen(id)` says whether the reader may open that card; an id the reader
 * may not open is kept as plain text, not as a link.
 */
export function splitCardIds(text: string, mayOpen: (id: string) => boolean): TextPiece[] {
  const pieces: TextPiece[] = []
  let last = 0
  for (const match of text.matchAll(CARD_ID_PATTERN)) {
    const id = match[0]
    const at = match.index ?? 0
    if (!mayOpen(id)) continue
    if (at > last) pieces.push({ text: text.slice(last, at) })
    pieces.push({ id, openable: true })
    last = at + id.length
  }
  if (last < text.length) pieces.push({ text: text.slice(last) })
  return pieces
}
