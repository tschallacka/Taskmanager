// The crew's activity over MCP: who of a crew board is working, queued, reviewing or idle, and which
// Backlog cards a free worker may start. It reads the office's own snapshot and desk states, so Pia's
// view and the office scene cannot disagree. Reach is the same as get_board's: a board the key cannot
// open is refused by findBoard, and a customer's contact sees only the tasks the audience may see.
import { blockedStatesOn } from './taskDependencyService'
import { audienceOf } from './mcpAccess'
import { findBoard } from './mcpBoardTools'
import { McpToolError, requireString } from './mcpToolKit'
import type { McpToolDefinition } from './mcpToolKit'
import { officeSnapshotOf } from './officeSnapshot'
import { deskStatesOf } from '../../shared/office/model'
import type { DeskStatus, OfficeTask } from '../../shared/office/model'

export interface NextCard {
  id: string
  title: string
  /** True when the card is assigned to this worker already; false when nobody has it yet. */
  assignedToMe: boolean
}

/**
 * The Backlog cards a worker may start, in order: the ones already assigned to them, then the unassigned
 * ones. Blocked cards are left out; "start only after" and "depends on" are read by Pia, not here.
 */
export function nextCardsFor(
  worker: { userId: string },
  backlog: readonly OfficeTask[],
  blocked: ReadonlySet<string>,
  limit = 3
): NextCard[] {
  const open = backlog.filter(task => !task.completed && !blocked.has(task.id))
  const mine = open.filter(task => task.assigneeId !== null && task.assigneeId === worker.userId)
  const free = open.filter(task => task.assigneeId === null)
  return [...mine, ...free].slice(0, limit).map(task => ({
    id: task.id,
    title: task.title,
    assignedToMe: task.assigneeId === worker.userId
  }))
}

export interface CrewActivityPerson extends DeskStatus {
  /** Workers only: the Backlog cards this worker may start next. */
  next: NextCard[]
}

export const MCP_CREW_TOOLS: McpToolDefinition[] = [
  {
    name: 'crew_activity',
    title: 'Read a crew board\'s activity',
    description: 'Show who of a crew board is busy: for each person of the crew, whether they are working (a card on their desk), queued (a card in their To do), reviewing (a card in their review gate) or idle, with the cards and, for an idle worker, the review gates their own cards wait in. Each worker also gets the Backlog cards they may start next: their own first, then unassigned ones, blocked cards left out. Use it to decide who gets the next card. Only a board this key can open is answered.',
    scope: 'boards:read',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        board: { type: 'string', description: 'Board id, board name, or a link to the board copied from the app.' }
      },
      required: ['board']
    },
    async handler(args, context) {
      const board = await findBoard(requireString(args, 'board'), context)
      let snapshot
      try {
        snapshot = await officeSnapshotOf({ id: board.id, name: board.name, audience: audienceOf(context, board) })
      } catch (error) {
        if ((error as { statusCode?: number })?.statusCode === 404) {
          throw new McpToolError(`Board "${board.name}" has no crew, so it has no activity to show. Give it a crew in the app first.`)
        }
        throw error
      }
      const states = deskStatesOf(snapshot)
      const backlog = snapshot.tasks.filter(task => task.stage === 'backlog')
      const blocked = await blockedStatesOn(board.id, backlog.map(task => task.id))
      const blockedIds = new Set([...blocked].filter(([, state]) => state.blocked).map(([id]) => id))
      const people: CrewActivityPerson[] = states.map((status) => {
        const person = snapshot.cast.find(p => p.key === status.key)
        const next = status.role === 'worker' && person?.userId
          ? nextCardsFor({ userId: person.userId }, backlog, blockedIds)
          : []
        return { ...status, next }
      })
      return { boardId: board.id, boardName: board.name, crewName: snapshot.crewName, people }
    }
  }
]
