// What a board is to the caller, as list_boards and get_board say it: its role in the crew tree, the board it works for
// or the one that works for it, whether this key may write to it, and one sentence for a crew key. The roles come
// from the crew tree (boardTree.ts); this file only names them for an agent and refuses a write on a real board with
// the reason and the board to use instead.
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { projects } from '../db/schema'
import type { Project } from '../db/schema'
import { forCall, type ApiKeyContext } from './api-keys'
import { boardFilter } from './mcpAccess'
import { crewIdOfUser, crewLinksOf } from './crewBoardAccess'
import { TAKEN_OFF_SUFFIX, plainBoardTreeFields, type BoardRole, type BoardTreeFields } from './boardTree'

/** The roles an agent sees: an ordinary board, the crew's home, a real board a crew reads, a crew's shadow, a board taken off. */
export type McpBoardRole = BoardRole | 'taken_off'

export interface BoardRoleFields {
  role: McpBoardRole
  realBoard: { id: string, name: string } | null
  shadowBoard: { id: string, name: string } | null
  shadows: BoardTreeFields['shadows']
  crew: BoardTreeFields['crew']
  canWrite: boolean
  note?: string
}

/** A detached shadow board: archived, renamed with the taken-off suffix, and no link to a real board any more. */
export function isTakenOff(board: Pick<Project, 'archivedAt' | 'name'>): boolean {
  return board.archivedAt != null && board.name.endsWith(TAKEN_OFF_SUFFIX)
}

/** The boards in `ids` this key may write to. A key without the write scope writes to none. */
async function writableIds(context: ApiKeyContext, ids: string[]): Promise<Set<string>> {
  if (!ids.length || !context.scopes.includes('boards:write')) return new Set()
  // The write call's own scope, with no read grant: a crew's read reach never makes a board writable.
  const scoped: ApiKeyContext = { ...forCall(context, 'boards:write'), readGrantedBoardIds: [] }
  const rows = await db.select({ id: projects.id }).from(projects).where(and(inArray(projects.id, ids), await boardFilter(scoped)))
  return new Set(rows.map(row => row.id))
}

/** The role fields of every board in `boards`, given the crew tree of each (boardTreeFields). */
export async function boardRoleFields(
  boards: Project[],
  tree: Map<string, BoardTreeFields>,
  context: ApiKeyContext
): Promise<Map<string, BoardRoleFields>> {
  const result = new Map<string, BoardRoleFields>()
  if (!boards.length) return result
  const writable = await writableIds(context, boards.map(board => board.id))
  const crewId = await crewIdOfUser(context.userId)

  for (const board of boards) {
    const fields = tree.get(board.id) ?? plainBoardTreeFields()
    let role: McpBoardRole = fields.role
    if (role === 'board' && isTakenOff(board)) role = 'taken_off'

    const realBoard = fields.realBoard ? { id: fields.realBoard.id, name: fields.realBoard.name } : null
    // A real board names the crew's own shadow board: the one of the caller's crew, else the only one the key sees.
    const ownShadow = crewId ? fields.shadows.find(shadow => shadow.crewId === crewId) : undefined
    const shadowBoard = role === 'real'
      ? (ownShadow ?? (fields.shadows.length === 1 ? fields.shadows[0] : undefined))
      : undefined

    // Only a crew account reads the crew's own sentence; a real board a crew reads is never writable to it.
    let note: string | undefined
    if (crewId && role === 'real') {
      note = 'The real board: read it; your crew never writes here. Boss carries results over.'
    } else if (crewId && role === 'shadow' && realBoard) {
      note = `Your crew's working board for '${realBoard.name}'. Plan and work here.`
    }

    result.set(board.id, {
      role,
      realBoard,
      shadowBoard: shadowBoard ? { id: shadowBoard.id, name: shadowBoard.name } : null,
      shadows: fields.shadows,
      crew: fields.crew,
      // A crew never writes to a real board it reads, whatever else the key may reach.
      canWrite: writable.has(board.id) && role !== 'taken_off' && !(crewId && role === 'real'),
      ...(note ? { note } : {})
    })
  }
  return result
}

/**
 * A write (or any read) that names a real board the caller's crew works on, but that the key may not reach as a board:
 * the reason, in one sentence, and the crew's shadow board to use instead. Null when the name is not such a board.
 */
export async function crewRealBoardRefusal(reference: string, context: ApiKeyContext): Promise<string | null> {
  const crewId = await crewIdOfUser(context.userId)
  if (!crewId) return null
  const links = await crewLinksOf(crewId)
  if (!links.length) return null
  const realRows = await db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, links.map(link => link.projectId)))
  const ref = reference.trim().toLowerCase()
  const real = realRows.find(row => row.id === reference.trim() || row.name.toLowerCase() === ref)
  if (!real) return null
  const link = links.find(item => item.projectId === real.id)
  if (!link) return null
  const [shadow] = await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, link.shadowProjectId))
  const shadowName = shadow?.name ?? 'the crew board'
  return `"${real.name}" is the real board your crew reads; it never writes there. Your crew works on "${shadowName}" (id ${link.shadowProjectId}): use that board.`
}
