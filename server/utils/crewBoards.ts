// A crew working on a real board. "Give it a crew" makes a shadow board in the crew's own team,
// linked to the real board (crew_boards). The rules, from the owner's answers:
//   - an owner or admin of the real board's team attaches only a crew THEY created (crews.created_by);
//   - the crew's own boards are never real boards;
//   - the crew reads the real board and never writes to it (the access side lives in crewBoardAccess.ts);
//   - detaching drops the link and archives the shadow board, so the crew's notes are kept.
import { and, asc, desc, eq, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { createError } from 'h3'
import { db } from '../db'
import { crewBoardMembers, crewBoards, crews, member, organization, projectColumns, projects, projectTasks, user } from '../db/schema'
import type { Crew, CrewBoard } from '../db/schema'
import { genId } from './projects'
import { CREW_SENTENCES, crewPermissionRefusal, instanceCrewsAllowed, isInstanceAdmin, teamCrewsAllowed } from './crewPermission'
import { BOARD_COLUMNS, CREW_PEOPLE, accountsOf, baseUrl, createOrRotateCrew, purgeCrew } from './crewProvisioning'
import type { CrewCaller, CrewInput } from './crewProvisioning'
import { isCrewUser, personKeyOf } from './crewAccounts'
import { removeForks } from './crewForks'
import { TEAM_ADMIN_ROLES } from './auth-helpers'
import { removeTaskAttachments } from './attachments'
import { CREW_SHADOW_SUFFIX, TAKEN_OFF_SUFFIX, hiddenCrewShadows } from './boardTree'
import { columnsForNewBoard } from './teamSettings'
import { publish, workspaceTopic } from './realtime'

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
  return `${realName}${CREW_SHADOW_SUFFIX}`
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
  // The crew permission: the three levels for this board (crewPermission.ts). Refused before anything is made.
  const refusal = await crewPermissionRefusal(userId, real.id)
  if (refusal) throw createError({ statusCode: 403, message: refusal })
  // A crew a person made works on one board only. A link is only ever added to such a crew that has none; the crews
  // the instance admin made keep the boards they have (the admin's own crews are not limited here).
  const [creator] = crew.createdBy
    ? await db.select({ isInstanceAdmin: user.isInstanceAdmin }).from(user).where(eq(user.id, crew.createdBy))
    : []
  const [other] = await db.select({ id: crewBoards.id }).from(crewBoards).where(eq(crewBoards.crewId, crew.id))
  if (other && !creator?.isInstanceAdmin) throw createError({ statusCode: 400, message: 'A crew works on one board only. Make another crew for this board.' })

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
    await tx.update(projects).set({ archivedAt: Date.now(), name: sql`${projects.name} || ${TAKEN_OFF_SUFFIX}` }).where(eq(projects.id, link.shadowProjectId))
  })
}

/**
 * The crew shadow board `shadowId` as `userId` may delete it. 404 when it is not a crew's shadow, or is hidden from the
 * person (the instance admin sees every crew board, so hidden does not stop them); 403 when they may not delete it.
 */
export async function crewShadowToDelete(userId: string, shadowId: string) {
  const board = await crewBoardOf(shadowId)
  if (!board) throw createError({ statusCode: 404, message: 'Project not found' })
  const instanceAdmin = await isInstanceAdmin(userId)
  if (!instanceAdmin && (await hiddenCrewShadows(userId, [shadowId])).has(shadowId)) {
    throw createError({ statusCode: 404, message: 'Project not found' })
  }
  if (!(await mayDeleteCrewBoard(userId, board))) {
    throw createError({ statusCode: 403, message: 'Only the board\'s owner, its crew\'s owner, an owner or admin of its team, or the instance admin can delete a crew board' })
  }
  return board
}

/** A crew's shadow board with the crew it is coupled to: the team member who made the crew, and the crew's team. */
export async function crewBoardOf(shadowId: string) {
  const [row] = await db
    .select({
      id: projects.id,
      userId: projects.userId,
      teamId: projects.teamId,
      crewCreatedBy: crews.createdBy,
      crewTeamId: crews.teamId
    })
    .from(crewBoards)
    .innerJoin(projects, eq(projects.id, crewBoards.shadowProjectId))
    .innerJoin(crews, eq(crews.id, crewBoards.crewId))
    .where(eq(crewBoards.shadowProjectId, shadowId))
  return row
}

/**
 * Whether `userId` may delete a crew's shadow board: the board's owner or the team member its crew is coupled to
 * (crews.created_by), an owner or admin of the board's team or of the crew's team, or the instance admin. A crew
 * account never may, whatever its team role; a customer contact has none of these.
 */
export async function mayDeleteCrewBoard(userId: string, board: NonNullable<Awaited<ReturnType<typeof crewBoardOf>>>): Promise<boolean> {
  if (await isCrewUser(userId)) return false
  if (userId === board.userId || userId === board.crewCreatedBy) return true
  if (await isInstanceAdmin(userId)) return true
  const teams = [...new Set([board.teamId, board.crewTeamId].filter((teamId): teamId is string => Boolean(teamId)))]
  if (!teams.length) return false
  const roles = await db.select({ role: member.role }).from(member)
    .where(and(eq(member.userId, userId), inArray(member.organizationId, teams)))
  return roles.some(row => TEAM_ADMIN_ROLES.includes(row.role))
}

/**
 * Deletes a crew's shadow board for good, in one transaction: the forked members' accounts (their keys go with them),
 * and the board row, which takes its columns, tasks, comments, pins, notifications and the crew link with it. Then the
 * files of its tasks are removed from disk, once the rows are gone.
 */
export async function deleteCrewBoard(shadowId: string): Promise<void> {
  const tasks = await db.select({ id: projectTasks.id }).from(projectTasks).where(eq(projectTasks.projectId, shadowId))
  await db.transaction(async (tx) => {
    const forks = await tx.select({ userId: crewBoardMembers.userId })
      .from(crewBoardMembers)
      .innerJoin(crewBoards, eq(crewBoards.id, crewBoardMembers.linkId))
      .where(eq(crewBoards.shadowProjectId, shadowId))
    if (forks.length) await tx.delete(user).where(inArray(user.id, forks.map(row => row.userId)))
    await tx.delete(projects).where(eq(projects.id, shadowId))
  })
  removeTaskAttachments(tasks.map(task => task.id))
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

// The crew API's view of boards (snake_case, every id labelled). A real board lists the shadow boards it has,
// and each shadow board the crew's people on it, with their @tag. Crew work boards and shadow boards are never
// offered as targets; the shadow board is the board a crew works on.
export interface UserboardView {
  board_id: string
  board_name: string
  shadowboards: { board_id: string, user_id: string | null, crew_ids: { id: string, tag: string }[] }[]
}

/** The userboard of one real board. `id` in crew_ids is the crew person's account id. */
export async function userboardOf(board: { id: string, name: string }): Promise<UserboardView> {
  const links = await db
    .select({ link: crewBoards, crew: crews })
    .from(crewBoards)
    .innerJoin(crews, eq(crews.id, crewBoards.crewId))
    .where(eq(crewBoards.projectId, board.id))
    .orderBy(asc(crewBoards.createdAt))
  const shadowboards: UserboardView['shadowboards'] = []
  for (const { link, crew } of links) {
    const people = (await accountsOf(crew.id))
      .map(person => ({ id: person.id, key: personKeyOf(crew.slug, person.email) }))
      .filter(person => CREW_PEOPLE.find(p => p.key === person.key)?.team !== 'contact')
    shadowboards.push({
      board_id: link.shadowProjectId,
      user_id: link.createdBy,
      crew_ids: people.map(person => ({ id: person.id, tag: `@${person.key}` }))
    })
  }
  return { board_id: board.id, board_name: board.name, shadowboards }
}

/** The userboards of a team: its boards, minus the crews' own work boards and the shadow boards. */
async function userboardsOfTeam(teamId: string): Promise<UserboardView[]> {
  const boards = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(
      eq(projects.teamId, teamId),
      isNull(projects.archivedAt),
      notInArray(projects.id, db.select({ id: crews.boardId }).from(crews).where(isNotNull(crews.boardId))),
      notInArray(projects.id, db.select({ id: crewBoards.shadowProjectId }).from(crewBoards))
    ))
    .orderBy(asc(projects.name))
  return Promise.all(boards.map(board => userboardOf(board)))
}

/**
 * The teams the key's owner runs as owner or admin, each with its userboards: what a crew can be bound to.
 * With `onlyBoardId` (a management token) only the team of that board, and only its userboard, are listed.
 */
export async function crewTargets(userId: string, onlyBoardId?: string) {
  const teams = await db
    .select({ id: organization.id, name: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), inArray(member.role, ['owner', 'admin'])))
    .orderBy(asc(organization.name))
  const [only] = onlyBoardId ? await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, onlyBoardId)) : []
  const shown = onlyBoardId ? teams.filter(team => team.id === only?.teamId) : teams
  return {
    teams: await Promise.all(shown.map(async team => ({
      team_id: team.id,
      team_name: team.name,
      // A management token makes no board (makeCrewOnNewBoard); any other key of an owner or admin may.
      canCreateBoard: !onlyBoardId && ['owner', 'admin'].includes(team.role),
      userboards: (await userboardsOfTeam(team.id)).filter(board => !onlyBoardId || board.board_id === onlyBoardId)
    })))
  }
}

/** The body of a newBoard part of a crew call, checked before anything is made. Null when the call has none. */
export function parseNewBoard(body: Record<string, unknown>, caller: CrewCaller): { teamId: string, name: string } | null {
  if (body.newBoard === undefined) return null
  if (caller.boardId) throw createError({ statusCode: 403, message: 'A management token cannot create a new board.' })
  if (body.projectId !== undefined) throw createError({ statusCode: 400, message: 'Send projectId or newBoard, not both.' })
  if (typeof body.teamId !== 'string' || body.teamId === '') throw createError({ statusCode: 400, message: 'newBoard needs a teamId.' })
  const part = typeof body.newBoard === 'object' && body.newBoard !== null && !Array.isArray(body.newBoard)
    ? body.newBoard as Record<string, unknown>
    : null
  const name = typeof part?.name === 'string' ? part.name.trim() : ''
  if (name.length < 1 || name.length > 120) {
    throw createError({ statusCode: 400, message: 'newBoard.name must be text of 1 to 120 characters.' })
  }
  return { teamId: body.teamId, name }
}

/**
 * Makes a crew with a board of its own. The board is made as the UI makes one: in `teamId`, owned by the caller,
 * with the team's default columns. Then the crew is bound to it exactly as makeBoundCrew binds one. The caller may
 * make the board when the UI would let them (a member of the team, as POST /api/projects checks), and the crew
 * permission must reach the team. A refused crew leaves no board
 * behind, and a rotate never makes one. The board's own crew switch is on: the caller asks for a crew on it.
 */
export async function makeCrewOnNewBoard(input: CrewInput, caller: CrewCaller, board: { teamId: string, name: string }): Promise<{ made: { status: 200 | 201, body: unknown }, boardId: string }> {
  const [existing] = await db.select().from(crews).where(eq(crews.slug, input.slug))
  if (existing && existing.createdBy !== caller.userId) throw createError({ statusCode: 404, message: 'No crew of yours with that slug.' })
  if (existing && input.rotate) {
    throw createError({ statusCode: 400, message: 'A crew that already exists keeps its board; use projectId or no board.' })
  }
  if (existing) {
    throw createError({
      statusCode: 409,
      message: existing.disabledAt
        ? 'This crew is disabled. Send rotate: true to re-enable it with new keys.'
        : 'This crew already exists. Send rotate: true for new keys.'
    })
  }

  const [role] = await db.select({ role: member.role }).from(member)
    .where(and(eq(member.organizationId, board.teamId), eq(member.userId, caller.userId)))
  if (!role) {
    throw createError({ statusCode: 403, message: 'Your key may not create boards in that team.' })
  }
  // The instance and team levels of the crew permission. The board's own level is set on the board made below.
  if (!(await isInstanceAdmin(caller.userId))) {
    const refusal = !(await instanceCrewsAllowed())
      ? CREW_SENTENCES.instance
      : !(await teamCrewsAllowed(board.teamId)) ? CREW_SENTENCES.team : null
    if (refusal) throw createError({ statusCode: 403, message: refusal })
  }

  const boardId = genId()
  const now = Date.now()
  const columns = await columnsForNewBoard(board.teamId)
  await db.transaction(async (tx) => {
    await tx.insert(projects).values({
      id: boardId,
      userId: caller.userId,
      teamId: board.teamId,
      name: board.name,
      crewsAllowed: true,
      createdAt: now,
      updatedAt: now
    })
    await tx.insert(projectColumns).values(columns.map((name, i) => ({
      id: genId(),
      projectId: boardId,
      name,
      position: i * 1000,
      createdAt: now
    })))
  })

  try {
    const made = await makeBoundCrew(input, caller, { projectId: boardId, teamId: board.teamId })
    await publish(workspaceTopic(caller.userId, board.teamId), { type: 'projects', projectId: boardId })
    return { made, boardId }
  } catch (error) {
    // Nothing of the attempt stays: the board goes (its columns with it), and a crew this call made goes too.
    await db.delete(projects).where(eq(projects.id, boardId))
    const [crew] = await db.select().from(crews).where(eq(crews.slug, input.slug))
    if (crew && crew.createdBy === caller.userId) await purgeCrew(crew)
    throw error
  }
}

/**
 * The real board a crew may be bound to, with the refusals attachCrew gives, checked before any crew is made or
 * rotated so that a refused call leaves nothing behind. The caller must be owner or admin of the board's team.
 */
export async function boardToBind(input: { projectId: unknown, teamId: unknown, userId: string, crew: Crew | null }) {
  const { projectId, teamId, userId, crew } = input
  if (typeof projectId !== 'string' || projectId === '') throw createError({ statusCode: 400, message: 'Pick a board.' })
  if (teamId !== undefined && (typeof teamId !== 'string' || teamId === '')) {
    throw createError({ statusCode: 400, message: 'teamId must be the id of a team.' })
  }
  const [real] = await db.select().from(projects).where(eq(projects.id, projectId))
  const teamOfBoard = real?.teamId
  if (!real || !teamOfBoard || (typeof teamId === 'string' && teamOfBoard !== teamId)) {
    throw createError({ statusCode: 404, message: typeof teamId === 'string' ? 'No such board in this team.' : 'No such board.' })
  }
  const [role] = await db.select({ role: member.role }).from(member)
    .where(and(eq(member.organizationId, teamOfBoard), eq(member.userId, userId)))
  if (!role || !['owner', 'admin'].includes(role.role)) {
    throw createError({ statusCode: 403, message: 'You do not have permission to do this' })
  }
  if (real.archivedAt) throw createError({ statusCode: 400, message: 'An archived board cannot be given a crew.' })
  const [shadowOf] = await db.select({ id: crewBoards.id }).from(crewBoards).where(eq(crewBoards.shadowProjectId, real.id))
  if (shadowOf || (crew && real.id === crew.boardId)) {
    throw createError({ statusCode: 400, message: 'A crew\'s own board cannot be given a crew.' })
  }
  return { ...real, teamId: teamOfBoard }
}

/** A board as the crew API names it: its id, its name and the URL it opens at. */
function boardRef(board: { id: string, name: string }) {
  return { board_id: board.id, board_name: board.name, url: `${baseUrl()}/projects/${board.id}` }
}

/**
 * Makes the crew (or rotates it, as createOrRotateCrew does) and binds it to a real board: its shadow board is
 * made in the crew's team and linked, by the key's owner. The answer is the crew's answer plus the userboard
 * of the real board, and the real and shadow boards with their URLs. A rotate of a crew already on this board
 * reuses its shadow board: a crew never gets a second one for the same board.
 */
export async function makeBoundCrew(input: CrewInput, caller: CrewCaller, bind: { projectId: unknown, teamId: unknown }): Promise<{ status: 200 | 201, body: unknown }> {
  const [existing] = await db.select().from(crews).where(eq(crews.slug, input.slug))
  if (existing && existing.createdBy !== caller.userId) {
    throw createError({ statusCode: 404, message: 'No crew of yours with that slug.' })
  }
  const real = await boardToBind({ projectId: bind.projectId, teamId: bind.teamId, userId: caller.userId, crew: existing ?? null })
  // Making or rotating a crew for a board needs the crew permission on that board (the three levels, see crewPermission.ts).
  const refusal = await crewPermissionRefusal(caller.userId, real.id)
  if (refusal) throw createError({ statusCode: 403, message: refusal })
  const made = await createOrRotateCrew(input, caller)
  const [crew] = await db.select().from(crews).where(eq(crews.slug, input.slug))
  const [linked] = await db.select().from(crewBoards)
    .where(and(eq(crewBoards.crewId, crew!.id), eq(crewBoards.projectId, real.id)))
  const link = linked ?? await attachCrew({ crew: crew!, projectId: real.id, teamId: real.teamId, userId: caller.userId })
  const [shadow] = await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, link.shadowProjectId))
  return {
    status: made.status,
    body: {
      ...(made.body as Record<string, unknown>),
      userboard: await userboardOf(real),
      real_board: boardRef(real),
      shadow_board: boardRef(shadow!)
    }
  }
}

/** Takes a crew off every board it works on: each link goes and its shadow board is archived. */
export async function detachCrewLinks(crewId: string): Promise<void> {
  const links = await db.select().from(crewBoards).where(eq(crewBoards.crewId, crewId))
  for (const link of links) await detachCrew(link)
}
