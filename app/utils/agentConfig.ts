// The per-agent MCP config (Boss's ruling on mwepy5fzg2i0jdvue7, with the owner's rulings): the main path is one JSON file
// per agent, with one server entry and the key in its header, started with --mcp-config and --strict-mcp-config. The
// folder form is a project-scope .mcp.json (one server, mode 600), excluded from git and never committed. The server name
// is unique per board and key: `taskmanager-<board slug>-<key label slug>`, never the bare `taskmanager`. No shared
// variable and nothing written to user scope or to a shell profile. Pure.

// Shown next to the old shared-variable text, so nobody mistakes it for the main path.
export const SHARED_VARIABLE_LEGACY_LABEL = 'Legacy: one shared environment variable for every key (TASKMANAGER_API_KEY). It breaks with several keys, so it is off by default. Prefer the agent config file.'

// A short slug for a name: lower case, letters and digits, dashes between words, at most 40 characters.
function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
}

// The server name for one key on one board, on one instance (the origin's host). Unique per instance, board and key; it
// is never the bare `taskmanager`, so another project's `taskmanager` entry cannot collide with it. The host is in the
// name so the same person's local dev app and live app get two names (owner's real case, 2026-11-13).
export function serverNameFor(boardName: string, keyLabel: string, origin = ''): string {
  const host = origin ? slug(new URL(origin).host) : ''
  const board = slug(boardName) || 'board'
  const key = slug(keyLabel) || 'key'
  return ['taskmanager', host, board, key].filter(Boolean).join('-')
}

// The one-server entry, with the key in its Authorization header.
function serverEntry(origin: string, token: string) {
  return { type: 'http', url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${token}` } }
}

// The JSON file one agent starts with (--mcp-config): one server, named for its key and board.
export function agentConfigFileText(origin: string, token: string, serverName: string): string {
  const config = { mcpServers: { [serverName]: serverEntry(origin, token) } }
  return `${JSON.stringify(config, null, 2)}\n`
}

// The command that starts Claude Code with that file, and no other MCP server.
export function agentConfigStartCommand(filePath: string): string {
  return `claude --mcp-config ${filePath} --strict-mcp-config`
}

// The project-scope .mcp.json body for a folder: the same one server, for the folder's own Claude Code sessions.
export function projectMcpJson(origin: string, token: string, serverName: string): string {
  return agentConfigFileText(origin, token, serverName)
}

// The project-scope add that writes the same entry into the folder's .mcp.json.
export function projectAddCommand(origin: string, token: string, serverName: string): string {
  return `claude mcp add --scope project --transport http ${serverName} ${origin}/api/mcp --header 'Authorization: Bearer ${token}'`
}

// The text the page copies for the folder form: remove an old bare entry first (it is what collides), add the project
// entry, keep the file out of git, and say plainly what Claude Code will ask.
export function projectSetupText(origin: string, token: string, serverName: string): string {
  return [
    '# 1. If an old taskmanager entry exists, remove it (it is the one that collides with other projects):',
    'claude mcp remove --scope user taskmanager 2>/dev/null',
    '# 2. In this folder, add the project entry. It writes .mcp.json here, with mode 600:',
    projectAddCommand(origin, token, serverName),
    'chmod 600 .mcp.json',
    '# 3. Keep the file out of git. In a git repository, add it to the local exclude list:',
    'echo ".mcp.json" >> .git/info/exclude',
    '# Do not commit .mcp.json: it holds the key. If this folder is not a git repository, keep the file out of any repo you make.',
    '# Claude Code asks you to approve a project server the first time it starts in this folder. Approve it.'
  ].join('\n')
}
