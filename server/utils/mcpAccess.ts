// What an API key may see and do: what the person it belongs to can in the
// browser, no more and no less. A key is the person acting through an agent, so
// it reaches the same boards by the same rule (their workspace, plus a customer's
// boards for a contact of that customer), sees the same tasks and updates on
// them (a contact sees only what is marked for customers), and may change only
// what that audience may change. Anything hidden from them is hidden from the
// agent, and anything the app would refuse them is refused here.
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { projects, projectTasks } from '../db/schema'
import type { Project } from '../db/schema'
import type { ApiKeyContext } from './api-keys'
import { audienceFor, customerIdsOf, sessionProjectFilter } from './auth-helpers'
import type { Audience } from './auth-helpers'
import { McpToolError } from './mcpToolKit'

/** Whether the key is limited to one customer's boards or to one board. */
export function isNarrowedKey(context: Pick<ApiKeyContext, 'customerId' | 'projectId'>): boolean {
  return Boolean(context.customerId || context.projectId)
}

/**
 * The boards this key's person can open: the same filter the browser uses, cut down to the
 * one board or customer a limited key is pinned to.
 */
export async function boardFilter(context: ApiKeyContext) {
  const open = sessionProjectFilter(context.userId, context.teamId, await customerIdsOf(context.userId))
  if (context.projectId) return and(open, eq(projects.id, context.projectId))
  if (context.customerId) return and(open, eq(projects.customerId, context.customerId))
  return open
}

/** How the person relates to a board: on its team, or a customer's contact. */
export function audienceOf(context: ApiKeyContext, board: Pick<Project, 'userId' | 'teamId'>): Audience {
  return audienceFor(context.userId, context.teamId, board)
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
