// Every tool the MCP server answers with, gathered from the modules that define
// them. A feature that comes with agent tools adds its module to this list and
// nothing else: the server's `tools/list`, its scope checks and the setup guide's
// catalogue all read from here.
import type { ApiKeyScope } from '../db/schema'
import { MCP_BOARD_TOOLS } from './mcpBoardTools'
import { MCP_CREW_TOOLS } from './mcpCrewTools'
import { MCP_FIELD_TOOLS } from './mcpFieldTools'
import { MCP_GITHUB_TOOLS } from './mcpGithubTools'
import { MCP_GOAL_TOOLS } from './mcpGoalTools'
import { MCP_HELP_TOOLS } from './mcpHelpTools'
import { MCP_ME_TOOLS } from './mcpMeTools'
import { MCP_MESSAGE_TOOLS } from './mcpMessageTools'
import { MCP_RULE_TOOLS } from './mcpRuleTools'
import { MCP_SECRET_TOOLS } from './mcpSecretTools'
import { MCP_STATUS_TOOLS } from './mcpStatusTools'
import { MCP_TIME_TOOLS } from './mcpTimeTools'
import { MCP_UPDATE_TOOLS } from './mcpUpdateTools'
import type { McpToolDefinition } from './mcpToolKit'

export const MCP_TOOLS: McpToolDefinition[] = [
  ...MCP_BOARD_TOOLS,
  ...MCP_CREW_TOOLS,
  ...MCP_FIELD_TOOLS,
  ...MCP_GITHUB_TOOLS,
  ...MCP_GOAL_TOOLS,
  ...MCP_HELP_TOOLS,
  ...MCP_MESSAGE_TOOLS,
  ...MCP_ME_TOOLS,
  ...MCP_RULE_TOOLS,
  ...MCP_SECRET_TOOLS,
  ...MCP_STATUS_TOOLS,
  ...MCP_TIME_TOOLS,
  ...MCP_UPDATE_TOOLS
]

export function toolsForScopes(scopes: ApiKeyScope[]): McpToolDefinition[] {
  return MCP_TOOLS.filter(tool => scopes.includes(tool.scope))
}

/**
 * Tools that answer for the whole workspace, not for one board: a key limited to one board
 * or one customer is not given them, so it cannot see or start anything beyond its reach.
 * Goals and portfolios gather boards across the team, create_board starts a new one, and the
 * inbox lists what happened on every board its owner follows.
 */
export const WORKSPACE_WIDE_TOOLS: ReadonlySet<string> = new Set([
  'create_board',
  'list_goals',
  'create_goal',
  'update_goal',
  'list_portfolios',
  'create_portfolio',
  'update_portfolio',
  'list_notifications',
  'mark_notifications_read'
])

/** The tools one key is given: those its permissions allow, less the workspace-wide ones when it is limited. */
export function toolsForKey(key: { scopes: ApiKeyScope[], customerId: string | null, projectId: string | null }): McpToolDefinition[] {
  const limited = Boolean(key.customerId || key.projectId)
  return toolsForScopes(key.scopes).filter(tool => !limited || !WORKSPACE_WIDE_TOOLS.has(tool.name))
}
