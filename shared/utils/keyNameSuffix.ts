// The suffix a new API key gets when its name slugs the same as a key the person already has (owner, 2026-11-13).
// The first key keeps the plain slug; a later one gets -2, -3, and so on. It is stored on the key's row when the key is
// made, because revoking a key deletes its row: a count taken later would lose the earlier key and change the name.
// Pure: the server calls it inside the key transaction and in the list endpoint, and the key panel reads the stored value.
// One field name end to end: `nameSuffix`, the column's name in the schema (api_keys.name_suffix).

// The part of a key row these functions read. The schema's row type satisfies it.
export interface SuffixRow {
  id: string
  name: string
  createdAt: number
  nameSuffix: string | null
}

// A short slug for a name: lower case, letters and digits, dashes between words, at most 40 characters.
export function keySlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
}

// The suffix for a new key with this name, given the rows the person already has. One more than the highest suffix among
// the rows with the same slug (a row's suffix is '' for the plain slug, '-N' for the others), so it never repeats a
// suffix that is still stored. A suffix freed by a revoke may be reused.
export function nextKeySuffix(name: string, existing: readonly { name: string, nameSuffix: string }[]): string {
  const target = keySlug(name) || 'key'
  const taken = existing
    .filter(row => (keySlug(row.name) || 'key') === target)
    .map(row => (row.nameSuffix === '' ? 1 : Number(row.nameSuffix.slice(1))))
  if (taken.length === 0) return ''
  return `-${Math.max(...taken) + 1}`
}

// Keys made before the suffix was stored have none (nameSuffix is null). Each gets one, oldest first (by creation time,
// then id), counting the suffixes already stored. Returns only the new values, by key id. A stored suffix is never changed:
// a row whose nameSuffix is set is not in the result.
export function backfillSuffixes(rows: readonly SuffixRow[]): Record<string, string> {
  const known: { name: string, nameSuffix: string }[] = rows
    .filter((row): row is SuffixRow & { nameSuffix: string } => row.nameSuffix !== null)
    .map(row => ({ name: row.name, nameSuffix: row.nameSuffix }))
  const missing = rows
    .filter(row => row.nameSuffix === null)
    .sort((a, b) => (a.createdAt - b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const assigned: Record<string, string> = {}
  for (const row of missing) {
    const nameSuffix = nextKeySuffix(row.name, known)
    assigned[row.id] = nameSuffix
    known.push({ name: row.name, nameSuffix })
  }
  return assigned
}
