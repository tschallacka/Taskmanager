// What an API key may see and do: what the person it belongs to can in the
// browser, no more and no less. A key is the person acting through an agent, so
// it reaches the same boards by the same rule (their workspace, plus a customer's
// boards for a contact of that customer), sees the same tasks and updates on
// them (a contact sees only what is marked for customers), and may change only
// what that audience may change. Anything hidden from them is hidden from the
// agent, and anything the app would refuse them is refused here.
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { projects, projectTasks } from '../db/schema'
import type { Project } from '../db/schema'
import { isNarrowedReach } from './api-keys'
import type { ApiKeyContext } from './api-keys'
import { customerIdsOf, projectAccessFilter, sessionProjectFilter } from './auth-helpers'
import type { Audience } from './auth-helpers'
import { guestProjectIdsOf } from './guests'
import { McpToolError } from './mcpToolKit'

/** Whether the key is cut down to one customer's boards, or to single boards and not to a whole workspace. */
export function isNarrowedKey(context: Pick<ApiKeyContext, 'customerId' | 'reach'>): boolean {
  return isNarrowedReach(context.customerId, context.reach)
}

/**
 * The boards this key may reach. The owner's open boards (every workspace they are a member of, their
 * personal boards, and the boards of the customers and guests they are let onto) are the outer limit.
 * The key's own grants pick from them: Select all, whole workspaces, single boards. Because the outer
 * limit is checked on every call, a grant stops working as soon as its owner loses access to the board.
 */
export async function boardFilter(context: ApiKeyContext) {
  const { userId, reach, memberTeamIds } = context
  const customerIds = await customerIdsOf(userId)
  const guestIds = await guestProjectIdsOf(userId)
  const open = or(
    memberTeamIds.length ? inArray(projects.teamId, memberTeamIds) : undefined,
    and(eq(projects.userId, userId), isNull(projects.teamId)),
    customerIds.length ? inArray(projects.customerId, customerIds) : undefined,
    guestIds.length ? inArray(projects.id, guestIds) : undefined
  )!

  const grants = [
    reach.allBoards ? open : undefined,
    ...reach.workspaceTeamIds.map(teamId => teamId
      ? projectAccessFilter(userId, teamId)
      : sessionProjectFilter(userId, null, customerIds, guestIds)),
    reach.boardIds.length ? inArray(projects.id, reach.boardIds) : undefined
  ]
  const granted = or(...grants) ?? sql`false`
  const narrowed = context.customerId ? and(granted, eq(projects.customerId, context.customerId)) : granted
  const reachable = and(open, narrowed)

  // A crew's read reach on the real boards it works on; only a plain read call carries it.
  const crewRead = context.readGrantedBoardIds ?? []
  return crewRead.length ? or(reachable, inArray(projects.id, crewRead)) : reachable
}

/**
 * How the person relates to a board: staff on a board of a workspace they are a member of, and on their
 * own personal boards; a customer's contact everywhere else. A board a crew reads through its crew link
 * counts as the team's, so the crew sees every task on it; it can only be reached by a read call, so
 * nothing it may not do is ever asked of it.
 */
export function audienceOf(context: ApiKeyContext, board: Pick<Project, 'userId' | 'teamId'> & { id?: string }): Audience {
  if (board.id && context.readGrantedBoardIds?.includes(board.id)) return 'staff'
  if (board.teamId) return context.memberTeamIds.includes(board.teamId) ? 'staff' : 'customer'
  return board.userId === context.userId ? 'staff' : 'customer'
}

/** Refuses what only a board's team may do, naming what was attempted. */
export function requireStaffAudience(context: ApiKeyContext, board: Pick<Project, 'name' | 'userId' | 'teamId'>, doing: string) {
  if (audienceOf(context, board) !== 'staff') {
    throw new McpToolError(`You work on "${board.name}" as a customer, so ${doing} is not open to you: that is for the team.`)
  }
}

/**
 * The tasks of these boards that the person may read: everything on the boards
 * they work on, and only the customer-visible tasks on a customer's board. For a
 * query across several boards at once.
 */
export function readableTasksIn(context: ApiKeyContext, boards: Pick<Project, 'id' | 'userId' | 'teamId'>[]) {
  const staff = boards.filter(board => audienceOf(context, board) === 'staff').map(board => board.id)
  const customer = boards.filter(board => audienceOf(context, board) === 'customer').map(board => board.id)

  const parts = []
  if (staff.length) parts.push(inArray(projectTasks.projectId, staff))
  if (customer.length) parts.push(and(inArray(projectTasks.projectId, customer), eq(projectTasks.visibility, 'customer')))
  return parts.length ? or(...parts)! : sql`false`
}
