// The crew permission: three switches, each of which can only narrow what the level above allows.
//   1. Instance: the instance admin allows or denies crew creation for the whole instance (instance_settings).
//   2. Team: where the instance allows, the team's owner or admin decides per team (team_settings.crews_allowed).
//   3. Board: where the team allows, the board's admin decides per board (projects.crews_allowed). Boards have no
//      admin role of their own, so a board admin is a team owner or admin, or a manager of the board.
// A crew works for a user only while all three are on. The check runs on every crew call, not only at creation:
// a crew of a switched-off level is refused with a plain sentence, and switching a level off disables the crews below it
// (crews are disabled, not deleted; rotating a crew turns it back on).
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { createError } from 'h3'
import { db } from '../db'
import { crewBoards, crews, instanceSettings, member, projectMembers, projects, teamSettings, user } from '../db/schema'
import type { Crew } from '../db/schema'
import { disableCrew } from './crewProvisioning'

export const INSTANCE_ROW_ID = 'instance'

export const CREW_SENTENCES = {
  instance: 'Your admin has not allowed crews on this instance.',
  team: 'The owner or admin of this team has not allowed crews for this team.',
  board: 'The owner or admin of this board has not allowed crews for this board.',
  notAdmin: 'You are no longer an owner or admin of this board\'s team, so its crews are off.',
  noTeam: 'A board with no team cannot have a crew.',
  disabled: 'This crew is disabled. Rotate it to turn it on again.',
  noBoard: 'Bind the key to one board: a crew works for one board only.'
} as const

/** Whether the instance allows crews. A missing row is off. */
export async function instanceCrewsAllowed(): Promise<boolean> {
  const [row] = await db.select({ crewsAllowed: instanceSettings.crewsAllowed }).from(instanceSettings).where(eq(instanceSettings.id, INSTANCE_ROW_ID))
  return Boolean(row?.crewsAllowed)
}

/** Whether a team allows crews for its boards. A team with no settings row is off. */
export async function teamCrewsAllowed(teamId: string): Promise<boolean> {
  const [row] = await db.select({ crewsAllowed: teamSettings.crewsAllowed }).from(teamSettings).where(eq(teamSettings.teamId, teamId))
  return Boolean(row?.crewsAllowed)
}

/** The `crewsAllowed` a toggle request sends: a true or false, anything else is refused. */
export function readCrewsAllowed(body: unknown): boolean {
  const value = (body as { crewsAllowed?: unknown } | null)?.crewsAllowed
  if (typeof value !== 'boolean') throw createError({ statusCode: 400, message: 'crewsAllowed must be true or false.' })
  return value
}

/**
 * The first refusal the three levels give a user for a board, or null when the crew may work. Pass a null board to
 * check the instance level only. Each level is read from the database on every call.
 */
/** Whether the person created a crew that is live (not disabled). Such a person's own crews:manage key may use those crews remotely. */
export async function ownsLiveCrew(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: crews.id }).from(crews)
    .where(and(eq(crews.createdBy, userId), isNull(crews.disabledAt)))
    .limit(1)
  return Boolean(row)
}

export async function crewPermissionRefusal(userId: string | null, boardId: string | null): Promise<string | null> {
  // The instance admin is never held by these switches: their crew calls and crews work as they always did.
  // The switches govern the crews of other people only.
  if (userId && (await isInstanceAdmin(userId))) return null
  if (!(await instanceCrewsAllowed())) return CREW_SENTENCES.instance
  if (!boardId) return null
  const [board] = await db.select({ id: projects.id, teamId: projects.teamId, crewsAllowed: projects.crewsAllowed })
    .from(projects).where(eq(projects.id, boardId))
  if (!board) return 'No such board.'
  if (!board.teamId) return CREW_SENTENCES.noTeam
  const [team] = await db.select({ crewsAllowed: teamSettings.crewsAllowed }).from(teamSettings).where(eq(teamSettings.teamId, board.teamId))
  if (!team?.crewsAllowed) return CREW_SENTENCES.team
  if (!board.crewsAllowed) return CREW_SENTENCES.board
  if (!userId) return CREW_SENTENCES.notAdmin
  const [role] = await db.select({ role: member.role }).from(member)
    .where(and(eq(member.organizationId, board.teamId), eq(member.userId, userId)))
  if (!role || !['owner', 'admin'].includes(role.role)) return CREW_SENTENCES.notAdmin
  return null
}

/**
 * The refusal for a crew as a whole: its own switch, then the levels of its owner for each board it works on.
 * A crew that works on no board only answers to the instance level.
 */
export async function crewRefusal(crew: Crew): Promise<string | null> {
  if (crew.disabledAt) return CREW_SENTENCES.disabled
  const links = await db.select({ projectId: crewBoards.projectId }).from(crewBoards).where(eq(crewBoards.crewId, crew.id))
  if (!links.length) return crewPermissionRefusal(crew.createdBy, null)
  for (const link of links) {
    const refusal = await crewPermissionRefusal(crew.createdBy, link.projectId)
    if (refusal) return refusal
  }
  return null
}

/**
 * The board a key's crew calls work on: a management token and every key of a non-admin owner are bound to the board
 * they name. An instance admin's ordinary key reaches no board and answers to the instance level only.
 */
export function boardOfCrewKey(key: { kind?: 'access' | 'management', projectId: string | null }, ownerIsAdmin: boolean): string | null {
  if (key.kind === 'management' || !ownerIsAdmin) return key.projectId
  return null
}

/** Turns the instance level on or off. Off disables every crew (the crews are kept, their keys stop working). */
export async function setInstanceCrews(allowed: boolean, userId: string | null, now = Date.now()): Promise<void> {
  await db.insert(instanceSettings)
    .values({ id: INSTANCE_ROW_ID, crewsAllowed: allowed, updatedAt: now, updatedBy: userId })
    .onConflictDoUpdate({ target: instanceSettings.id, set: { crewsAllowed: allowed, updatedAt: now, updatedBy: userId } })
  if (!allowed) await disableCrews(await nonAdminCrews(await db.select().from(crews).where(isNull(crews.disabledAt))))
}

/** Whether a person is the instance admin, read from the database. */
export async function isInstanceAdmin(userId: string): Promise<boolean> {
  const [row] = await db.select({ isInstanceAdmin: user.isInstanceAdmin }).from(user).where(eq(user.id, userId))
  return Boolean(row?.isInstanceAdmin)
}

/** The crews of the list that someone other than the instance admin made: only those a switch may disable. */
async function nonAdminCrews(list: Crew[]): Promise<Crew[]> {
  const creators = [...new Set(list.map(crew => crew.createdBy).filter((id): id is string => Boolean(id)))]
  if (!creators.length) return list
  const admins = new Set(
    (await db.select({ id: user.id, isInstanceAdmin: user.isInstanceAdmin }).from(user).where(inArray(user.id, creators)))
      .filter(row => row.isInstanceAdmin)
      .map(row => row.id)
  )
  return list.filter(crew => !(crew.createdBy && admins.has(crew.createdBy)))
}

/** Turns a team's level on or off. Off disables the crews that work on the team's boards. */
export async function setTeamCrews(teamId: string, allowed: boolean, now = Date.now()): Promise<void> {
  await db.insert(teamSettings)
    .values({ teamId, crewsAllowed: allowed, updatedAt: now })
    .onConflictDoUpdate({ target: teamSettings.teamId, set: { crewsAllowed: allowed, updatedAt: now } })
  if (!allowed) {
    const boards = await db.select({ id: projects.id }).from(projects).where(eq(projects.teamId, teamId))
    await disableCrewsOnBoards(boards.map(board => board.id))
  }
}

/** Turns a board's level on or off. Off disables the crews that work on the board. */
export async function setBoardCrews(projectId: string, allowed: boolean): Promise<void> {
  await db.update(projects).set({ crewsAllowed: allowed }).where(eq(projects.id, projectId))
  if (!allowed) await disableCrewsOnBoards([projectId])
}

/** Disables the crews working on any of these boards. Crews are disabled, not deleted. */
async function disableCrewsOnBoards(boardIds: string[]): Promise<void> {
  if (!boardIds.length) return
  const links = await db.select({ crewId: crewBoards.crewId }).from(crewBoards).where(inArray(crewBoards.projectId, boardIds))
  const ids = [...new Set(links.map(link => link.crewId))]
  if (!ids.length) return
  await disableCrews(await nonAdminCrews(await db.select().from(crews).where(inArray(crews.id, ids))))
}

async function disableCrews(list: Crew[]): Promise<void> {
  for (const crew of list) await disableCrew(crew)
}

/** Whether a board's switch may be changed by this user: a team owner or admin, or a manager of the board. */
export async function mayManageBoardCrews(userId: string, projectId: string): Promise<boolean> {
  const [board] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, projectId))
  if (!board?.teamId) return false
  const [role] = await db.select({ role: member.role }).from(member)
    .where(and(eq(member.organizationId, board.teamId), eq(member.userId, userId)))
  if (role && ['owner', 'admin'].includes(role.role)) return true
  const [manager] = await db.select({ id: projectMembers.id }).from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId), eq(projectMembers.role, 'manager')))
  return Boolean(manager)
}
