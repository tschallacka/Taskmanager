// The Blocking list of a task: the tasks that wait for it (the inverse of Blocked by). Read from the same link rows
// (task_dependencies: blockedTaskId waits for blockerTaskId), so there is no schema change. Pure, so the route, the MCP
// field and the panel all read one answer. A deleted task is not listed. A customer sees the titles of customer-visible
// waiting tasks, and a count of the rest, as the blocked mark does today.

import type { Audience } from './auth-helpers'

export interface BlockingLink {
  blockedTaskId: string
  blockerTaskId: string
}

export interface BlockingTask {
  id: string
  title: string
  columnId: string
  visibility: 'internal' | 'customer'
  deleted: boolean
}

export interface WaitingTask {
  id: string
  title?: string
  columnId: string
  finished: boolean
}

export interface BlockingList {
  /** The tasks that wait for this one, team view: each with its state. Customers get only the customer-visible ones. */
  waiting: WaitingTask[]
  /** How many waiting tasks the viewer may not see (always 0 for staff). */
  hidden: number
  /** How many waiting tasks there are in all, for the badge; deleted tasks are not counted. */
  count: number
  /** The blocker is finished, so the waiting tasks are free to be picked up. */
  free: boolean
}

/**
 * The Blocking list of `taskId`. `terminalColumnIds` are the board's finishing columns, which make a waiting task
 * "finished"; `blockerFinished` says whether this task itself sits in one, so the list can say "now free".
 */
export function blockingOf(input: {
  taskId: string
  links: BlockingLink[]
  tasks: Map<string, BlockingTask>
  terminalColumnIds: Set<string>
  blockerFinished: boolean
  audience: Audience
}): BlockingList {
  const waitingIds = [...new Set(input.links.filter(link => link.blockerTaskId === input.taskId).map(link => link.blockedTaskId))]
  const live = waitingIds
    .map(id => input.tasks.get(id))
    .filter((task): task is BlockingTask => task !== undefined && !task.deleted)
  const staff = input.audience === 'staff'
  const visible = staff ? live : live.filter(task => task.visibility === 'customer')
  const waiting: WaitingTask[] = visible
    .map(task => ({
      id: task.id,
      columnId: task.columnId,
      finished: input.terminalColumnIds.has(task.columnId),
      title: task.title
    }))
    .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
  return {
    waiting,
    hidden: live.length - visible.length,
    count: live.length,
    free: input.blockerFinished && live.length > 0
  }
}
