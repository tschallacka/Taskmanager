// The marker line in the owner documents (PROJECT-RULES.md, BRIEF.md, JANET.md). The text above the marker is kit text:
// an update replaces it with the new template's kit text. The text below the marker is the project's: an update never
// reads or changes it, so there is no merge and no conflict. A file without the marker is migrated once: the new kit
// text goes above a new marker and the old file is kept entirely below it. Pure: no files, no network.

export const MARKER = '<!-- crew:project-rules below this line: yours; the kit never changes anything after it -->'

/** The kit part (the text above the marker, the marker and its line end) and the project part (the rest), or null. */
export function splitOwnerFile(text) {
  const at = text.indexOf(MARKER)
  if (at < 0) return null
  // The marker is a line of its own: its line end belongs to the kit part. A file ending on the marker has no project part.
  const end = at + MARKER.length
  const lineEnd = text[end] === '\n' ? end + 1 : end
  return { kit: text.slice(0, lineEnd), own: text.slice(lineEnd) }
}

/**
 * The file an update writes, given the file on disk and the new template (which carries the marker).
 * status: 'unchanged' (already the new kit text with the same project part), 'updated' (kit text replaced, project
 * part kept byte for byte), or 'migrated' (no marker before: the new kit text above a marker, the old file below).
 */
export function updateOwnerFile(current, newTemplate) {
  const kitPart = splitOwnerFile(newTemplate)
  if (!kitPart) throw new Error('the new template has no marker line')
  const mine = splitOwnerFile(current)
  if (!mine) return { status: 'migrated', text: kitPart.kit + current }
  const text = kitPart.kit + mine.own
  return { status: text === current ? 'unchanged' : 'updated', text }
}
