// Which inbox notes a listener announces. A note is announced once: its id is kept with the time it was first seen, and
// the kept ids are dropped by age, not by count. A note older than NOTE_MAX_AGE_MS is never announced, so a listener that
// starts again does not repeat old notes when its list of seen ids is pruned.

export const NOTE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

/** The notes state from the file: an object of id -> first-seen time. An older file kept a list of ids; those are seen now. */
export function migrateNotes(notes, now) {
  if (notes && !Array.isArray(notes) && typeof notes === 'object') return { ...notes }
  if (Array.isArray(notes)) return Object.fromEntries(notes.map(id => [id, now]))
  return {}
}

/**
 * The notes to print now. Returns the notifications to announce and the new notes state. Nothing is announced twice,
 * and nothing older than the cap is announced at all, however many notes the inbox holds.
 */
export function takeNotes(notes, notifications, now) {
  const seen = migrateNotes(notes, now)
  const announce = []
  for (const n of notifications) {
    if (!n || n.read || !n.id) continue
    const created = Date.parse(n.at)
    const at = Number.isFinite(created) ? created : now
    if (now - at > NOTE_MAX_AGE_MS) continue
    if (n.id in seen) continue
    seen[n.id] = now
    announce.push(n)
  }
  for (const [id, firstSeen] of Object.entries(seen)) {
    if (now - firstSeen > NOTE_MAX_AGE_MS) delete seen[id]
  }
  return { announce, notes: seen }
}
