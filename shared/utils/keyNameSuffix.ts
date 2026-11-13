// The suffix a new API key gets when its name slugs the same as a key the person already has (owner, 2026-11-13).
// The first key keeps the plain slug; a later one gets -2, -3, and so on. It is stored on the key's row when the key is
// made, because revoking a key deletes its row: a count taken later would lose the earlier key and change the name.
// Pure: the server calls it inside the key transaction, and the key panel reads the stored value.

// A short slug for a name: lower case, letters and digits, dashes between words, at most 40 characters.
export function keySlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
}

// The suffix for a new key with this name, given the rows the person already has (name and stored suffix). One more
// than the highest suffix among the rows with the same slug (a row is '' for the plain slug, '-N' for the others), so it
// never repeats a suffix that is still stored.
// Keys made before the suffix was stored have none. Each gets one, oldest first (by creation time, then id), counting the
// suffixes already stored. Returns only the new values, by key id. A stored suffix is never changed.
export function backfillSuffixes(rows: readonly { id: string, name: string, createdAt: number, suffix: string | null }[]): Record<string, string> {
  const known: { name: string, suffix: string }[] = rows
    .filter((row): row is typeof row & { suffix: string } => row.suffix !== null)
    .map(row => ({ name: row.name, suffix: row.suffix }))
  const missing = rows
    .filter(row => row.suffix === null)
    .sort((a, b) => (a.createdAt - b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const assigned: Record<string, string> = {}
  for (const row of missing) {
    const suffix = nextKeySuffix(row.name, known)
    assigned[row.id] = suffix
    known.push({ name: row.name, suffix })
  }
  return assigned
}

export function nextKeySuffix(name: string, existing: readonly { name: string, suffix: string }[]): string {
  const target = keySlug(name) || 'key'
  const taken = existing
    .filter(row => (keySlug(row.name) || 'key') === target)
    .map(row => (row.suffix === '' ? 1 : Number(row.suffix.slice(1))))
  if (taken.length === 0) return ''
  return `-${Math.max(...taken) + 1}`
}
