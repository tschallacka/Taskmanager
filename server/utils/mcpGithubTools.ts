// Agent tools for GitHub links on a task: link an issue, pull request, branch or
// workflow run, remove the link, and read what GitHub says about the task's links.
// Reading follows the task's audience rule: a customer's contact gets only the links
// marked for customers, and only those are fetched. Changing the links is for the
// team, as changing the task is.
import { findTask } from './mcpBoardTools'
import { audienceOf } from './mcpAccess'
import { taskShareUrl } from './shareLinks'
import { createTaskGithubLink, deleteTaskGithubLink, readTaskGithubLinks } from './githubTaskLinks'
import { McpToolError, optionalBoolean, optionalString, requireString } from './mcpToolKit'
import type { McpToolDefinition } from './mcpToolKit'

// Board results carry `board` at the top level: the MCP server reads it to tell the
// open browsers that the board changed (announceWrite in server/api/mcp/index.post.ts).
function boardOf(board: { id: string, name: string }) {
  return { id: board.id, name: board.name }
}

export const MCP_GITHUB_TOOLS: McpToolDefinition[] = [
  {
    name: 'link_github',
    title: 'Link a GitHub item to a task',
    description: 'Link a GitHub issue, pull request, branch or workflow run to a task, from a github.com link, owner/repo#123, or #123 when the project has a default repo. Returns the link with what GitHub says about it now. Linking is for the team, and the link keeps its visibility: internal (the default) is hidden from customers.',
    scope: 'boards:write',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task id, or a link to the task copied from the app.' },
        input: { type: 'string', description: 'A github.com link to an issue, pull request, branch or workflow run; or owner/repo#123; or #123 for the project\'s default repo.' },
        visibility: { type: 'string', description: '"internal" (the default unless the project sets another) or "customer".' }
      },
      required: ['taskId', 'input']
    },
    async handler(args, context) {
      const { task, board } = await findTask(requireString(args, 'taskId'), context, { staff: 'linking GitHub items' })
      const result = await createTaskGithubLink({
        task,
        board,
        audience: audienceOf(context, board),
        input: requireString(args, 'input'),
        visibility: optionalString(args, 'visibility'),
        userId: context.userId
      })
      if (!result.ok) throw new McpToolError(result.message)
      return { board: boardOf(board), ...result.link }
    }
  },
  {
    name: 'unlink_github',
    title: 'Remove a GitHub link from a task',
    description: 'Remove one GitHub link from a task. The GitHub item itself is untouched. Linking and unlinking are for the team.',
    scope: 'boards:write',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task id, or a link to the task copied from the app.' },
        linkId: { type: 'string', description: 'The link id, from get_task or get_task_github.' }
      },
      required: ['taskId', 'linkId']
    },
    async handler(args, context) {
      const { task, board } = await findTask(requireString(args, 'taskId'), context, { staff: 'unlinking GitHub items' })
      const result = await deleteTaskGithubLink({ task, linkId: requireString(args, 'linkId'), audience: audienceOf(context, board) })
      if (!result.ok) throw new McpToolError(result.message)
      return { board: boardOf(board), unlinked: true, linkId: result.linkId }
    }
  },
  {
    name: 'get_task_github',
    title: 'Read a task\'s GitHub links',
    description: 'The GitHub items linked to a task, each with its state, labels and comments (for an issue), its pull requests, review and check state (for a pull request), its branch\'s position against the default branch, or its workflow run status. Shows only the links the key\'s person may see on the task, and the data is as fresh as the cache allows. Pass refresh to ask GitHub now.',
    scope: 'boards:read',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task id, or a link to the task copied from the app.' },
        refresh: { type: 'boolean', description: 'Ask GitHub for fresh data now, instead of the cached copy. Rate limits still apply.' }
      },
      required: ['taskId']
    },
    async handler(args, context) {
      const { task, board } = await findTask(requireString(args, 'taskId'), context)
      const { links } = await readTaskGithubLinks({ taskId: task.id, audience: audienceOf(context, board), refresh: optionalBoolean(args, 'refresh') ?? false })
      // The task's link to share: staff only, as the other task links are.
      return {
        board: boardOf(board),
        task: task.id,
        ...(audienceOf(context, board) === 'staff' ? { url: taskShareUrl(board.id, task.id) } : {}),
        total: links.length,
        links
      }
    }
  }
]
