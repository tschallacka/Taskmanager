// A Sprocket run: the server's own key for one answer, made in memory and never stored. It acts as one person, with the
// permissions a fresh MCP connection gets by default (read and write boards) and the person's whole reach; every call
// is still cut to what the person may open at the time (the same checks as any key). A customer contact's run is limited
// to their customer, as a customer key is. The run's tool list is the MCP list for that key less every sensitive tool,
// and a call by name to a sensitive tool is refused (mcpRegistry.ts). The audit names the person and "Sprocket".
import { teamIdsOf } from './api-keys'
import type { ApiKeyContext } from './api-keys'
import { maskEmails } from './emailPrivacy'
import { McpToolError } from './mcpToolKit'
import { MCP_TOOLS, sprocketRefusal, toolsForSprocket } from './mcpRegistry'
import type { McpToolDefinition } from './mcpToolKit'

/** The permissions a fresh MCP connection gets by default: the read and write board scopes. */
export const SPROCKET_RUN_SCOPES: ApiKeyContext['scopes'] = ['boards:read', 'boards:write']

export interface SprocketRunPerson {
  userId: string
  /** The team the person works in now; a customer contact's run is in the customer's team. */
  teamId: string | null
  /** Set for a customer contact: the run then sees only that customer's boards, as a customer key does. */
  customerId?: string | null
}

/** The context of one Sprocket run. Built per answer, held in memory, never written to the key tables. */
export async function sprocketRunContext(person: SprocketRunPerson): Promise<ApiKeyContext> {
  return {
    keyId: `sprocket-run:${person.userId}`,
    keyName: 'Sprocket',
    userId: person.userId,
    teamId: person.teamId,
    customerId: person.customerId ?? null,
    projectId: null,
    scopes: [...SPROCKET_RUN_SCOPES],
    kind: 'access',
    boardScopes: null,
    reach: { allBoards: true, workspaceTeamIds: [], boardIds: [] },
    memberTeamIds: await teamIdsOf(person.userId),
    sprocketRun: true
  }
}

/** The tools a run is given, as the MCP list shows them (no sensitive tool). */
export function sprocketRunTools(context: ApiKeyContext): McpToolDefinition[] {
  return toolsForSprocket(context)
}

/** The same tools in the function-calling form a chat model takes. */
export function sprocketRunToolSpecs(context: ApiKeyContext) {
  return sprocketRunTools(context).map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }
  }))
}

/**
 * Runs one tool for a Sprocket run. A sensitive tool is refused by name, and a tool the run is not given is unknown to
 * it. Errors come back as McpToolError messages the model can read.
 */
export async function runSprocketTool(name: string, args: Record<string, unknown>, context: ApiKeyContext): Promise<unknown> {
  const tool = MCP_TOOLS.find(candidate => candidate.name === name)
  if (!tool) throw new McpToolError(`Unknown tool "${name}".`)
  const refusal = sprocketRefusal(tool, context)
  if (refusal) throw new McpToolError(refusal)
  if (!sprocketRunTools(context).some(candidate => candidate.name === name)) {
    throw new McpToolError(`Sprocket is not given "${name}" for this person.`)
  }
  return hideForSprocket(await tool.handler(args, { ...context, callScope: tool.scope }), context.userId)
}

/**
 * Takes out of a tool's answer every address the person may not see (the email privacy rules, as the members lists
 * apply them). An address with no id beside it is removed. Run on every answer a Sprocket run gets, from either path.
 */
export async function hideForSprocket<T>(value: T, userId: string): Promise<T> {
  const holders: Array<Record<string, unknown>> = []
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>
      if (typeof record.email === 'string') holders.push(record)
      Object.values(record).forEach(visit)
    }
  }
  visit(value)

  const withId = holders.filter(holder => typeof holder.id === 'string')
  const shown = withId.length
    ? await maskEmails(userId, withId.map(holder => ({ id: holder.id as string, email: holder.email as string })))
    : []
  withId.forEach((holder, index) => {
    holder.email = shown[index]?.email ?? null
  })
  holders.filter(holder => typeof holder.id !== 'string').forEach((holder) => {
    delete holder.email
  })
  return value
}
