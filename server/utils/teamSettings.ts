// What a team keeps for itself: today the columns a new board starts with.
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { teamSettings } from '../db/schema'

/** The columns a board starts with when its team has not chosen its own. */
export const DEFAULT_COLUMNS = ['Backlog', 'To do', 'Verify', 'Done'] as const

export const MAX_DEFAULT_COLUMNS = 12
export const MAX_COLUMN_NAME_LENGTH = 40

export class DefaultColumnsError extends Error {}

/**
 * Cleans a list of column names from the page: trims, drops blanks and repeats (ignoring
 * case), and refuses what a board cannot start with. Null or an empty list means "use the
 * built-in set" and comes back as null.
 */
export function normaliseDefaultColumns(input: unknown): string[] | null {
  if (input === null || input === undefined) return null
  if (!Array.isArray(input)) throw new DefaultColumnsError('Default columns must be a list of names.')
  const seen = new Set<string>()
  const names: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string') throw new DefaultColumnsError('Every column name must be text.')
    const name = raw.trim().replace(/\s+/g, ' ')
    if (!name) continue
    if (name.length > MAX_COLUMN_NAME_LENGTH) {
      throw new DefaultColumnsError(`A column name is limited to ${MAX_COLUMN_NAME_LENGTH} characters: "${name.slice(0, 20)}…".`)
    }
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  if (names.length === 0) return null
  if (names.length > MAX_DEFAULT_COLUMNS) {
    throw new DefaultColumnsError(`A new board can start with at most ${MAX_DEFAULT_COLUMNS} columns.`)
  }
  return names
}

/** The team's own default columns, or null when it has not set any. */
export async function readDefaultColumns(teamId: string): Promise<string[] | null> {
  const [row] = await db.select({ defaultColumns: teamSettings.defaultColumns }).from(teamSettings).where(eq(teamSettings.teamId, teamId))
  return row?.defaultColumns?.length ? row.defaultColumns : null
}

/** The names a new board in this workspace starts with. A personal board has no team, so no settings. */
export async function columnsForNewBoard(teamId: string | null): Promise<readonly string[]> {
  if (!teamId) return DEFAULT_COLUMNS
  return (await readDefaultColumns(teamId)) ?? DEFAULT_COLUMNS
}

/** Stores the team's default columns; null puts the built-in set back. */
export async function writeDefaultColumns(teamId: string, columns: string[] | null): Promise<void> {
  const now = Date.now()
  await db.insert(teamSettings)
    .values({ teamId, defaultColumns: columns, updatedAt: now })
    .onConflictDoUpdate({ target: teamSettings.teamId, set: { defaultColumns: columns, updatedAt: now } })
}
