// A crew working on a real board. "Give it a crew" makes a shadow board in the crew's own team,
// linked to the real board (crew_boards). The rules, from the owner's answers:
//   - an owner or admin of the real board's team attaches only a crew THEY created (crews.created_by);
//   - the crew's own boards are never real boards;
//   - the crew reads the real board and never writes to it (the access side lives in crewBoardAccess.ts);
//   - detaching drops the link and archives the shadow board, so the crew's notes are kept.
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { createError } from 'h3'
import { db } from '../db'
import { crewBoards, crews, member, projectColumns, projects } from '../db/schema'
import type { Crew, CrewBoard } from '../db/schema'
import { genId } from './projects'
import { BOARD_COLUMNS } from './crewProvisioning'
import { removeForks } from './crewForks'

export interface CrewChoice {
  id: string
  slug: string
  name: string
}

export interface CrewLinkView {
  id: string
  crewId: string
  crewName: string
  crewSlug: string
  crewTeamId: string
  inCrewTeam: boolean
  crewDisabled: boolean
  projectId: string
  projectName: string
  shadowProjectId: string
  shadowProjectName: string
  createdAt: number
}

/** The name the shadow board carries: the real board's, marked as the crew's. */
export function shadowBoardName(realName: string): string {
  return `${realName} (crew)`
}

/** A crew the caller made and that is live: the only kind they may attach (Q42a). Others read as not found. */
export async function requireOwnCrew(crewId: unknown, userId: string): Promise<Crew> {
  if (typeof crewId !== 'string' || crewId === '') throw createError({ statusCode: 400, message: 'Pick a crew.' })
  const [crew] = await db.select().from(crews).where(eq(crews.id, crewId))
  if (!crew || crew.createdBy !== userId) throw createError({ statusCode: 404, message: 'No crew of yours with that id.' })
  if (crew.disabledAt) throw createError({ statusCode: 400, message: 'That crew is disabled.' })
  return crew
}

/** The crews this person may attach: the live ones they created. */
export async function crewsToAttach(userId: string): Promise<CrewChoice[]> {
  return db
    .select({ id: crews.id, slug: crews.slug, name: crews.name })
    .from(crews)
    .where(and(eq(crews.createdBy, userId), isNull(crews.disabledAt)))
    .orderBy(crews.name)
}

/** Makes the shadow board in the crew's team and links it. The real board must belong to `teamId`. */
export async function attachCrew(input: { crew: Crew, projectId: unknown, teamId: string, userId: string }): Promise<CrewBoard> {
  const { crew, teamId, userId } = input
  if (typeof input.projectId !== 'string' || input.projectId === '') throw createError({ statusCode: 400, message: 'Pick a board.' })
  const [real] = await db.select().from(projects).where(and(eq(projects.id, input.projectId), eq(projects.teamId, teamId)))
  if (!real) throw createError({ statusCode: 404, message: 'No such board in this team.' })
  if (real.archivedAt) throw createError({ statusCode: 400, message: 'An archived board cannot be given a crew.' })
  // Only the crew's own work board and its shadow board are refused: any other board of the team may take the crew,
  // including one in the crew's own team. A shadow board is the crew's own board too, so it gets the same message.
  const [shadowOf] = await db.select({ id: crewBoards.id }).from(crewBoards).where(eq(crewBoards.shadowProjectId, real.id))
  if (real.id === crew.boardId || shadowOf) throw createError({ statusCode: 400, message: 'A crew\'s own board cannot be given a crew.' })

  const [already] = await db.select({ id: crewBoards.id }).from(crewBoards)
    .where(and(eq(crewBoards.crewId, crew.id), eq(crewBoards.projectId, real.id)))
  if (already) throw createError({ statusCode: 409, message: `${crew.name} already works on this board.` })

  const now = Date.now()
  const shadowId = genId()
  const linkId = genId()
  await db.transaction(async (tx) => {
    await tx.insert(projects).values({
      id: shadowId,
      userId,
      teamId: crew.teamId,
      customerId: crew.customerId,
      name: shadowBoardName(real.name),
      createdAt: now,
      updatedAt: now
    })
    await tx.insert(projectColumns).values(BOARD_COLUMNS.map((name, i) => ({
      id: genId(),
      projectId: shadowId,
      name,
      position: i * 1000,
      createdAt: now
    })))
    await tx.insert(crewBoards).values({ id: linkId, crewId: crew.id, projectId: real.id, shadowProjectId: shadowId, createdBy: userId, createdAt: now })
  })
  const [link] = await db.select().from(crewBoards).where(eq(crewBoards.id, linkId))
  return link!
}

/** The link, only when its real board belongs to `teamId`: a link of another team is simply not found. */
export async function findCrewLink(teamId: string, linkId: string): Promise<CrewBoard | undefined> {
  const [row] = await db
    .select({ link: crewBoards })
    .from(crewBoards)
    .innerJoin(projects, eq(projects.id, crewBoards.projectId))
    .where(and(eq(crewBoards.id, linkId), eq(projects.teamId, teamId)))
  return row?.link
}

/** Drops the link and archives the shadow board, so what the crew wrote on it is kept. The forked members go: their keys reach nothing else. */
export async function detachCrew(link: CrewBoard): Promise<void> {
  await removeForks(link.id)
  await db.transaction(async (tx) => {
    await tx.delete(crewBoards).where(eq(crewBoards.id, link.id))
    await tx.update(projects).set({ archivedAt: Date.now(), name: sql`${projects.name} || ' (taken off)'` }).where(eq(projects.id, link.shadowProjectId))
  })
}

/**
 * Every crew link on the boards of a team, newest first, for the Crews section and the board menu.
 * `inCrewTeam` says whether `userId` belongs to the crew's team, which is where the shadow board lives:
 * its members open it with full access. Everyone else on the real board's team reads it, never writes.
 */
export async function crewLinksOfTeam(teamId: string, userId: string): Promise<CrewLinkView[]> {
  const real = alias(projects, 'real_board')
  const shadow = alias(projects, 'shadow_board')
  const rows = await db
    .select({
      id: crewBoards.id,
      crewId: crews.id,
      crewName: crews.name,
      crewSlug: crews.slug,
      crewTeamId: crews.teamId,
      crewDisabledAt: crews.disabledAt,
      projectId: real.id,
      projectName: real.name,
      shadowProjectId: shadow.id,
      shadowProjectName: shadow.name,
      createdAt: crewBoards.createdAt
    })
    .from(crewBoards)
    .innerJoin(crews, eq(crews.id, crewBoards.crewId))
    .innerJoin(real, eq(real.id, crewBoards.projectId))
    .innerJoin(shadow, eq(shadow.id, crewBoards.shadowProjectId))
    .where(and(eq(real.teamId, teamId), isNull(shadow.archivedAt)))
    .orderBy(desc(crewBoards.createdAt))
  const mine = rows.length
    ? await db.select({ teamId: member.organizationId }).from(member)
        .where(and(eq(member.userId, userId), inArray(member.organizationId, rows.map(row => row.crewTeamId))))
    : []
  const mineIds = new Set(mine.map(row => row.teamId))
  return rows.map(({ crewDisabledAt, ...row }) => ({ ...row, crewDisabled: crewDisabledAt !== null, inCrewTeam: mineIds.has(row.crewTeamId) }))
}
