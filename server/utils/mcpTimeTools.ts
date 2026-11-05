// Agent tools for time tracking: log time against a task, and read what has been
// logged. Entries belong to the person who owns the API key.
import { formatDuration } from '#shared/utils/duration'
import { entriesWhere, loadEntries, logEntry, parseEntryDay, parseEntryMinutes, parseEntryNote, parseRange, startTimer, stopTimer } from './timeTracking'
import { accessibleBoards, findStaffBoard, findTask } from './mcpBoardTools'
import { isNarrowedKey } from './mcpAccess'
import { McpToolError, asToolError, optionalString, requireString } from './mcpToolKit'
import type { McpToolDefinition } from './mcpToolKit'

export const MCP_TIME_TOOLS: McpToolDefinition[] = [
  {
    name: 'log_time',
    title: 'Log time on a task',
    description: 'Log time spent on a task, as the key\'s owner. Give "duration" as people write it (1h 30m, 1:30, 45m; a bare number counts as hours), the "day" it was worked (YYYY-MM-DD, default today) and an optional note.',
    scope: 'boards:write',
    readOnly: false,
    resource: 'time',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'The task id, or a link to the task copied from the app.' },
        duration: { type: 'string', description: 'How long it took: 1h 30m, 1:30, 45m, or hours as a number.' },
        day: { type: 'string', description: 'The day the work was done, YYYY-MM-DD. Defaults to today.' },
        note: { type: 'string', description: 'What the time was spent on.' }
      },
      required: ['task', 'duration']
    },
    async handler(args, context) {
      const { task, board } = await findTask(requireString(args, 'task'), context, { staff: 'time tracking' })
      const minutes = asToolError(() => parseEntryMinutes({ duration: args.duration }))
      const day = asToolError(() => parseEntryDay(optionalString(args, 'day')))
      const entry = await logEntry({
        taskId: task.id,
        projectId: board.id,
        userId: context.userId,
        minutes,
        day,
        note: parseEntryNote(optionalString(args, 'note'))
      })
      return {
        logged: true,
        board: { id: board.id, name: board.name },
        task: { id: task.id, title: task.title },
        entry: { id: entry.id, day: entry.day, duration: formatDuration(entry.minutes), minutes: entry.minutes, ...(entry.note ? { note: entry.note } : {}) }
      }
    }
  },
  {
    name: 'list_time',
    title: 'Read logged time',
    description: 'Read logged time, newest day first, with totals. Pass "task" for everything on one task; pass "board" with "from" and "to" for everyone\'s time on a board; pass only "from" and "to" for the key owner\'s own time across all boards.',
    scope: 'boards:read',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'A task id or link: everything logged on it.' },
        board: { type: 'string', description: 'A board id, name or link; needs from and to.' },
        from: { type: 'string', description: 'First day, YYYY-MM-DD.' },
        to: { type: 'string', description: 'Last day, YYYY-MM-DD. At most 92 days from "from".' }
      }
    },
    async handler(args, context) {
      const taskRef = optionalString(args, 'task')
      const boardRef = optionalString(args, 'board')
      let where
      let scope: Record<string, unknown>

      if (taskRef) {
        const { task, board } = await findTask(taskRef, context, { staff: 'time tracking' })
        where = entriesWhere({ taskId: task.id })
        scope = { task: { id: task.id, title: task.title }, board: { id: board.id, name: board.name } }
      } else {
        const range = asToolError(() => parseRange(optionalString(args, 'from'), optionalString(args, 'to')))
        if (boardRef) {
          const board = await findStaffBoard(boardRef, context, 'time tracking')
          where = entriesWhere({ projectIds: [board.id], ...range })
          scope = { board: { id: board.id, name: board.name }, ...range }
        } else {
          // A key limited to one board or customer reads the owner's time on its own boards only.
          const own = isNarrowedKey(context) ? (await accessibleBoards(context)).map(board => board.id) : undefined
          where = entriesWhere({ userId: context.userId, projectIds: own, ...range })
          scope = { owner: 'the key\'s owner', ...range }
        }
      }
      if (!where) throw new McpToolError('Pass a task, or a from and to.')

      const entries = await loadEntries(where)
      const total = entries.reduce((sum, entry) => sum + entry.minutes, 0)
      return {
        ...scope,
        total: formatDuration(total),
        totalMinutes: total,
        entries: entries.map(entry => ({
          day: entry.day,
          duration: formatDuration(entry.minutes),
          minutes: entry.minutes,
          person: entry.author.name,
          task: entry.taskTitle,
          board: entry.projectName,
          ...(entry.note ? { note: entry.note } : {})
        }))
      }
    }
  },
  {
    name: 'start_timer',
    title: 'Start a timer on a task',
    description: 'Start a running timer on a task, as the key\'s owner. One timer runs at a time: a timer already running is stopped first and what it measured is logged, and that entry comes back as "stopped". Stop the timer with stop_timer when the work ends.',
    scope: 'boards:write',
    readOnly: false,
    resource: 'time',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'The task id, or a link to the task copied from the app.' }
      },
      required: ['task']
    },
    async handler(args, context) {
      const { task, board } = await findTask(requireString(args, 'task'), context, { staff: 'time tracking' })
      const stopped = await startTimer(context.userId, task.id)
      return {
        started: true,
        board: { id: board.id, name: board.name },
        task: { id: task.id, title: task.title },
        ...(stopped ? { stopped: { id: stopped.id, day: stopped.day, duration: formatDuration(stopped.minutes), minutes: stopped.minutes } } : {})
      }
    }
  },
  {
    name: 'stop_timer',
    title: 'Stop the running timer',
    description: 'Stop the running timer of the key\'s owner and log what it measured, rounded to the nearest minute with a floor of one minute. Give an optional "note" naming the activity (triage, build, ux review). Nothing running is not an error: "stopped" is false.',
    scope: 'boards:write',
    readOnly: false,
    resource: 'time',
    inputSchema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'What the time was spent on.' }
      }
    },
    async handler(args, context) {
      const entry = await stopTimer(context.userId, { note: parseEntryNote(optionalString(args, 'note')) })
      if (!entry) return { stopped: false }
      return {
        stopped: true,
        entry: { id: entry.id, taskId: entry.taskId, day: entry.day, duration: formatDuration(entry.minutes), minutes: entry.minutes, ...(entry.note ? { note: entry.note } : {}) }
      }
    }
  }
]
