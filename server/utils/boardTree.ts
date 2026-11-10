// The crew tree of the board list. A real board that a crew works on has one shadow board per crew (crew_boards:
// project_id = the real board, shadow_project_id = the shadow). The list shows the shadow nested under its real
// board, so nothing here stores anything new: the tree is read from crew_boards at answer time, and every "(crew)"
// board that already exists folds in by itself. The crew's home board (crews.board_id) is not a shadow; it stays
// where it is and is only labelled as the crew's home.
//
// Two kinds of board join a person's list beside the boards of their active workspace, both only for a person who
// belongs to the team the board lives in (the same rule as the rest of the list, see crewBoardAccess.ts):
//   - a shadow board of a real board in the list, when the person is in the shadow's crew team (the real board's
//     staff see the crew's board nested under it, read-only from this workspace);
//   - the real board of a shadow in the list, when the person is in the shadow's team (the crew's own members see
//     the real board nested over the shadow as a label row only: it opens nothing and its tasks are not served.
//     Opening a real board for a crew is a separate access decision, not made here).
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db'
import { crewBoards, crews, member, projects } from '../db/schema'

export type BoardRole = 'board' | 'real' | 'shadow' | 'crew_home'

export interface BoardRef {
  id: string
  name: string
}

export interface CrewRef {
  id: string
  name: string
  slug: string
}

/** A shadow board as a real board lists it: its own id and name, and the crew it belongs to. */
export interface CrewShadowRef {
  id: string
  name: string
  crewId: string
  crewName: string
  crewSlug: string
}

/** What a board is in the crew tree, as the list answers it. */
export interface BoardTreeFields {
  role: BoardRole
  /** On a shadow board: the real board it works for. */
  realBoard: BoardRef | null
  /** On a real board: the shadow boards of the crews that work on it, among the boards the list shows. */
  shadows: CrewShadowRef[]
  /** On a shadow board: its crew. On a crew's home board: the crew whose home it is. */
  crew: CrewRef | null
}

const PLAIN: BoardTreeFields = { role: 'board', realBoard: null, shadows: [], crew: null }

/** The teams a person is a member of. */
async function teamsOf(userId: string): Promise<string[]> {
  const rows = await db.select({ teamId: member.organizationId }).from(member).where(eq(member.userId, userId))
  return rows.map(row => row.teamId)
}

/**
 * The boards a person sees beside the boards of `own` (their list, before the tree): the shadow boards of the real
 * boards in `own` that sit in a team they belong to, and the real boards of the shadows in `own` that sit in a team
 * they belong to. Archived boards are never added.
 */
export async function treeNeighbours(userId: string, ownIds: string[]): Promise<{ shadowIds: string[], realIds: string[] }> {
  if (!ownIds.length) return { shadowIds: [], realIds: [] }
  const teams = await teamsOf(userId)
  if (!teams.length) return { shadowIds: [], realIds: [] }
  const shadow = alias(projects, 'tree_shadow')
  const real = alias(projects, 'tree_real')

  const shadows = await db
    .select({ id: crewBoards.shadowProjectId })
    .from(crewBoards)
    .innerJoin(shadow, eq(shadow.id, crewBoards.shadowProjectId))
    .where(and(inArray(crewBoards.projectId, ownIds), inArray(shadow.teamId, teams), isNull(shadow.archivedAt)))

  const reals = await db
    .select({ id: crewBoards.projectId })
    .from(crewBoards)
    .innerJoin(shadow, eq(shadow.id, crewBoards.shadowProjectId))
    .innerJoin(real, eq(real.id, crewBoards.projectId))
    .where(and(inArray(crewBoards.shadowProjectId, ownIds), inArray(shadow.teamId, teams), isNull(real.archivedAt)))

  const own = new Set(ownIds)
  return {
    shadowIds: [...new Set(shadows.map(row => row.id))].filter(id => !own.has(id)),
    realIds: [...new Set(reals.map(row => row.id))].filter(id => !own.has(id))
  }
}

/**
 * The crew tree fields of every board in `boardIds`. `shown` is the set of boards the list answers with: a real
 * board lists only the shadow boards in `shown`, so nobody is told about a shadow they may not see.
 */
export async function boardTreeFields(boardIds: string[], shown: Set<string>): Promise<Map<string, BoardTreeFields>> {
  const result = new Map<string, BoardTreeFields>()
  for (const id of boardIds) result.set(id, { ...PLAIN, shadows: [] })
  if (!boardIds.length) return result

  const shadow = alias(projects, 'tree_shadow_board')
  const real = alias(projects, 'tree_real_board')
  const links = await db
    .select({
      projectId: crewBoards.projectId,
      realName: real.name,
      shadowId: crewBoards.shadowProjectId,
      shadowName: shadow.name,
      crewId: crews.id,
      crewName: crews.name,
      crewSlug: crews.slug
    })
    .from(crewBoards)
    .innerJoin(crews, eq(crews.id, crewBoards.crewId))
    .innerJoin(real, eq(real.id, crewBoards.projectId))
    .innerJoin(shadow, eq(shadow.id, crewBoards.shadowProjectId))
    .where(or(inArray(crewBoards.projectId, boardIds), inArray(crewBoards.shadowProjectId, boardIds)))
    .orderBy(asc(crewBoards.createdAt))

  const crew = (row: { crewId: string, crewName: string, crewSlug: string }): CrewRef => ({ id: row.crewId, name: row.crewName, slug: row.crewSlug })

  for (const link of links) {
    if (result.has(link.shadowId)) {
      result.set(link.shadowId, {
        role: 'shadow',
        realBoard: { id: link.projectId, name: link.realName },
        shadows: [],
        crew: crew(link)
      })
    }
    if (result.has(link.projectId) && shown.has(link.shadowId)) {
      const entry = result.get(link.projectId)!
      entry.role = 'real'
      entry.shadows.push({ id: link.shadowId, name: link.shadowName, crewId: link.crewId, crewName: link.crewName, crewSlug: link.crewSlug })
    }
  }

  // A shadow keeps its role over everything; a real board keeps it over the crew home it may also be listed as.
  const homes = await db
    .select({ boardId: crews.boardId, id: crews.id, name: crews.name, slug: crews.slug })
    .from(crews)
    .where(inArray(crews.boardId, boardIds))
  for (const home of homes) {
    if (!home.boardId) continue
    const entry = result.get(home.boardId)
    if (entry && entry.role === 'board') {
      entry.role = 'crew_home'
      entry.crew = { id: home.id, name: home.name, slug: home.slug }
    }
  }
  return result
}
