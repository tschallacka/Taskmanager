// The per-agent MCP config (Boss's ruling on mwepy5fzg2i0jdvue7): the main path is one JSON file per agent, with one server
// entry and the key in its header, started with --mcp-config and --strict-mcp-config. The single-person option is a
// folder-local add. No shared environment variable on the main path. Pure.

// The server name the file and the local add use. One definition per agent, not one per key.
export const AGENT_SERVER_NAME = 'taskmanager'

// Shown next to the old shared-variable text, so nobody mistakes it for the main path.
export const SHARED_VARIABLE_LEGACY_LABEL = 'Legacy: one shared environment variable for every key (TASKMANAGER_API_KEY). Prefer the agent config file.'

// The JSON file one agent starts with: one server, the board API, the key in its Authorization header.
export function agentConfigFileText(origin: string, token: string, serverName: string = AGENT_SERVER_NAME): string {
  const config = {
    mcpServers: {
      [serverName]: {
        type: 'http',
        url: `${origin}/api/mcp`,
        headers: { Authorization: `Bearer ${token}` }
      }
    }
  }
  return `${JSON.stringify(config, null, 2)}\n`
}

// The command that starts Claude Code with that file, and no other MCP server.
export function agentConfigStartCommand(filePath: string): string {
  return `claude --mcp-config ${filePath} --strict-mcp-config`
}

// The single-person option: a folder-local add, for one person's own folder.
export function localAddCommand(origin: string, token: string): string {
  return `claude mcp add --scope local --transport http ${AGENT_SERVER_NAME} ${origin}/api/mcp --header 'Authorization: Bearer ${token}'`
}
