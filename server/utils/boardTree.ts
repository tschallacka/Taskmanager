// The crew tree of the board list. A real board that a crew works on has one shadow board per crew (crew_boards:
// project_id = the real board, shadow_project_id = the shadow). The list shows the shadow nested under its real
// board, so nothing here stores anything new: the tree is read from crew_boards at answer time, and every "(crew)"
// board that already exists folds in by itself. The crew's home board (crews.board_id) is not a shadow; it stays
// where it is and is only labelled as the crew's home.
//
// A crew's shadow board is seen only by the crew's owner, by the owners and admins of the team it lives in, and by the
// crew's own accounts (hiddenCrewShadows). The list and the search both drop the shadows a person may not see.
// Two kinds of board join a person's list beside the boards of their active workspace:
//   - a shadow board of a real board in the list, when the person may see it (the rule above);
//   - the real board of a shadow in the list, when the person is in the shadow's team (the crew's own members see
//     the real board nested over the shadow as a label row only: it opens nothing and its tasks are not served.
//     Opening a real board for a crew is a separate access decision, not made here).
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db'
import { crewBoards, crews, member, projects, user } from '../db/schema'

/**
 * A real board as a crew's member sees it beside the crew's shadow: only the keys the tree needs. Nothing about the
 * board itself (description, customer, settings) reaches a crew, since the crew cannot open the board.
 */
export function labelRowOf(project: { id: string, name: string, updatedAt: number }) {
  return { id: project.id, name: project.name, role: 'real' as const, readOnly: true as const, updatedAt: project.updatedAt }
}

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

/**
 * The real board of a shadow, as the breadcrumb needs it. `openable` says whether this person belongs to the real
 * board's workspace and can open it there (after a workspace switch); a crew's member who is not in that workspace
 * gets the name only.
 */
export interface RealBoardRef extends BoardRef {
  teamId: string | null
  openable: boolean
}

/** What a board is in the crew tree, as the list answers it. */
export interface BoardTreeFields {
  role: BoardRole
  /** On a shadow board: the real board it works for. */
  realBoard: RealBoardRef | null
  /** On a real board: the shadow boards of the crews that work on it, among the boards the list shows. */
  shadows: CrewShadowRef[]
  /** On a shadow board: its crew. On a crew's home board: the crew whose home it is. */
  crew: CrewRef | null
}

const PLAIN: BoardTreeFields = { role: 'board', realBoard: null, shadows: [], crew: null }

/**
 * The crew shadow boards among `boardIds` that `userId` may not see. A crew's board is seen only by the crew's owner,
 * by the owners and admins of the team it lives in (the crew's team) and of the real board's team, and by the crew's
 * own accounts (user.crewId). Every other board is not a crew board and is never hidden here. The list and the search
 * both use this one rule.
 */
export async function hiddenCrewShadows(userId: string, boardIds: string[]): Promise<Set<string>> {
  const hidden = new Set<string>()
  if (!boardIds.length) return hidden
  const realBoard = alias(projects, 'visibility_real')
  const rows = await db
    .select({
      shadowId: crewBoards.shadowProjectId,
      crewId: crewBoards.crewId,
      createdBy: crews.createdBy,
      shadowTeamId: projects.teamId,
      realTeamId: realBoard.teamId
    })
    .from(crewBoards)
    .innerJoin(crews, eq(crews.id, crewBoards.crewId))
    .innerJoin(projects, eq(projects.id, crewBoards.shadowProjectId))
    .innerJoin(realBoard, eq(realBoard.id, crewBoards.projectId))
    .where(inArray(crewBoards.shadowProjectId, boardIds))
  if (!rows.length) return hidden
  const [account] = await db.select({ crewId: user.crewId }).from(user).where(eq(user.id, userId))
  const adminTeams = new Set((await db
    .select({ teamId: member.organizationId })
    .from(member)
    .where(and(eq(member.userId, userId), inArray(member.role, ['owner', 'admin'])))).map(row => row.teamId))
  for (const row of rows) {
    const visible = row.createdBy === userId
      || (row.shadowTeamId !== null && adminTeams.has(row.shadowTeamId))
      || (row.realTeamId !== null && adminTeams.has(row.realTeamId))
      || (Boolean(account?.crewId) && account?.crewId === row.crewId)
    if (!visible) hidden.add(row.shadowId)
  }
  return hidden
}

/**
 * The boards a person sees beside the boards of `ownIds` (their list, before the tree), with the crew shadows they may
 * not see taken out of `ownIds` first: `hidden` lists them, and the caller drops them from its own list and search.
 * shadowIds: the shadow boards of the real boards in the list, visible to the person. realIds: the real board of a
 * shadow in the list, as a label row. Archived boards are never added.
 */
// The list and /api/tasks both call this, so the same rule decides what each shows: keep them in step.
export async function treeNeighbours(userId: string, ownIds: string[]): Promise<{ hidden: Set<string>, shadowIds: string[], realIds: string[] }> {
  const hidden = await hiddenCrewShadows(userId, ownIds)
  const visible = ownIds.filter(id => !hidden.has(id))
  if (!visible.length) return { hidden, shadowIds: [], realIds: [] }
  const shadow = alias(projects, 'tree_shadow')
  const real = alias(projects, 'tree_real')
  const own = new Set(visible)

  const shadows = await db
    .select({ id: crewBoards.shadowProjectId })
    .from(crewBoards)
    .innerJoin(shadow, eq(shadow.id, crewBoards.shadowProjectId))
    .where(and(inArray(crewBoards.projectId, visible), isNull(shadow.archivedAt)))

  const reals = await db
    .select({ id: crewBoards.projectId })
    .from(crewBoards)
    .innerJoin(real, eq(real.id, crewBoards.projectId))
    .where(and(inArray(crewBoards.shadowProjectId, visible), isNull(real.archivedAt)))

  // The shadows the person may see are hidden from nothing here; a shadow they may not see never reached `visible`.
  const hiddenNow = await hiddenCrewShadows(userId, shadows.map(row => row.id))
  return {
    hidden,
    shadowIds: [...new Set(shadows.map(row => row.id))].filter(id => !own.has(id) && !hiddenNow.has(id)),
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
      realTeamId: real.teamId,
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

  // A board can be a shadow for one crew and a real board for another. A shadow keeps its role whatever the row
  // order: the shadow branch sets it, and the real branch never overwrites it.
  for (const link of links) {
    if (result.has(link.shadowId)) {
      const entry = result.get(link.shadowId)!
      entry.role = 'shadow'
      entry.realBoard = { id: link.projectId, name: link.realName, teamId: link.realTeamId, openable: false }
      entry.crew = crew(link)
    }
    if (result.has(link.projectId) && shown.has(link.shadowId)) {
      const entry = result.get(link.projectId)!
      if (entry.role !== 'shadow') entry.role = 'real'
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

/** The workspaces a person belongs to: the ones they can open a board of after a switch. */
export async function memberTeamsOf(userId: string): Promise<Set<string>> {
  const rows = await db.select({ teamId: member.organizationId }).from(member).where(eq(member.userId, userId))
  return new Set(rows.map(row => row.teamId))
}

/**
 * Marks which real boards in the tree the person can open: those in a workspace they belong to. Set on the shadow's
 * breadcrumb only; a real board they cannot open keeps `openable: false` and reads as a name, not a link.
 */
export function markOpenableRealBoards(fields: Map<string, BoardTreeFields>, teams: Set<string>): void {
  for (const entry of fields.values()) {
    if (entry.realBoard) entry.realBoard.openable = entry.realBoard.teamId !== null && teams.has(entry.realBoard.teamId)
  }
}
