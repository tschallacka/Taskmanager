// The MCP setup the connect prompt copies (owner and Boss, 2026-11-13, on mwepy5fzg2i0jdvue7). Two forms.
//
// Per agent (several agents on one machine): one JSON file per agent, one server, the key in its header, started with
// --mcp-config and --strict-mcp-config. The server name is unique per instance, board and key:
// taskmanager-<host-short>-<board slug>-<key slug>.
//
// Per folder (one person, always on in one folder): a project .mcp.json whose header reads ${VAR}, and a
// .claude/settings.local.json env block that sets VAR. The server is taskmanager-<key slug>, the variable
// TASKMANAGER_<KEY SLUG>. Only those two files change, both are excluded from git and never committed. Nothing goes to
// user scope or to a shell profile, and headersHelper is not used. Pure.

// Shown next to the old shared-variable text, so nobody mistakes it for the main path.
export const SHARED_VARIABLE_LEGACY_LABEL = 'Legacy: one shared environment variable for every key (TASKMANAGER_API_KEY). It breaks with several keys, so it is off by default. Prefer the agent config file.'

// A short slug for a name: lower case, letters and digits, dashes between words, at most 40 characters.
function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
}

// A short name for an origin's host: `local` for localhost, else the name just before the top domain
// (taskmanager.tschallacka.dev reads as tschallacka).
export function hostShort(origin: string): string {
  const labels = new URL(origin).hostname.split('.')
  if (labels[labels.length - 1] === 'localhost') return 'local'
  return labels.length >= 3 ? labels[labels.length - 2]! : labels[0]!
}

// Per agent: the server name for one key on one board, on one instance (the origin's host). Never the bare `taskmanager`.
export function serverNameFor(boardName: string, keyLabel: string, origin = ''): string {
  const host = origin ? slug(hostShort(origin)) : ''
  const board = slug(boardName) || 'board'
  const key = slug(keyLabel) || 'key'
  return ['taskmanager', host, board, key].filter(Boolean).join('-')
}

// The one-server entry, with the key in its Authorization header.
function serverEntry(origin: string, authorization: string) {
  return { type: 'http', url: `${origin}/api/mcp`, headers: { Authorization: authorization } }
}

// Per agent: the JSON file one agent starts with (--mcp-config): one server, the key written in.
export function agentConfigFileText(origin: string, token: string, serverName: string): string {
  const config = { mcpServers: { [serverName]: serverEntry(origin, `Bearer ${token}`) } }
  return `${JSON.stringify(config, null, 2)}\n`
}

// Per agent: the command that starts Claude Code with that file, and no other MCP server.
export function agentConfigStartCommand(filePath: string): string {
  return `claude --mcp-config ${filePath} --strict-mcp-config`
}

// Per folder: the project server name for a key (the folder is the boundary, so no host or board).
export function projectServerName(keyLabel: string): string {
  return `taskmanager-${slug(keyLabel) || 'key'}`
}

// Per folder: the variable that holds the key. Written in capitals with underscores.
export function projectVariableName(keyLabel: string): string {
  return `TASKMANAGER_${(slug(keyLabel) || 'key').replace(/-/g, '_').toUpperCase()}`
}

// Per folder: the project .mcp.json body. The header reads the variable; no key value is in the file.
export function projectMcpText(origin: string, keyLabel: string): string {
  const name = projectServerName(keyLabel)
  const variable = projectVariableName(keyLabel)
  const config = { mcpServers: { [name]: serverEntry(origin, `Bearer \${${variable}}`) } }
  return `${JSON.stringify(config, null, 2)}\n`
}

// Per folder: the env block that sets the variable, as a new settings.local.json.
export function settingsLocalText(keyLabel: string, token: string): string {
  return `${JSON.stringify({ env: { [projectVariableName(keyLabel)]: token } }, null, 2)}\n`
}

// Per folder: an existing .claude/settings.local.json with the variable added to its env block. Its other settings and
// env entries are kept; a file that is not JSON is an error, so nothing is overwritten by mistake.
export function mergeSettingsLocal(existingText: string, keyLabel: string, token: string): string {
  const existing = JSON.parse(existingText) as { env?: Record<string, string> } & Record<string, unknown>
  const merged = { ...existing, env: { ...(existing.env ?? {}), [projectVariableName(keyLabel)]: token } }
  return `${JSON.stringify(merged, null, 2)}\n`
}

// Per folder: the text the page copies for the folder form. Reads top to bottom, one step each.
export function projectSetupText(origin: string, keyLabel: string): string {
  const name = projectServerName(keyLabel)
  const variable = projectVariableName(keyLabel)
  return [
    `# Folder setup for the server ${name}. Run these in the project folder. The key is not in this text; paste it where the step says.`,
    '# 1. Optional, only if you still have an old bare user-scope entry called taskmanager (it collides with other projects):',
    '#    claude mcp remove --scope user taskmanager',
    `# 2. Write .mcp.json in this folder. Its header reads \${${variable}}, so the key is not in the file:`,
    `#    server ${name} at ${origin}/api/mcp, header Authorization: Bearer \${${variable}}`,
    '# 3. Write .claude/settings.local.json with the key in its env block (merge it if the file exists; keep its other settings):',
    `#    "env": { "${variable}": "<paste the key here>" }`,
    'chmod 600 .mcp.json .claude/settings.local.json',
    '# 4. Keep both files out of git. In a git repository, add them to the local exclude list:',
    'echo ".mcp.json" >> .git/info/exclude',
    'echo ".claude/settings.local.json" >> .git/info/exclude',
    '# Do not commit .mcp.json or .claude/settings.local.json: the key is in the settings file. If the folder is not a git repository, keep both out of any repo you make.',
    '# 5. Start Claude Code in this folder. The first time, it asks you to approve the project server. Approve it.',
    '# 6. Check inside the session with /mcp. Do not judge by `claude mcp list`: it reports the variable as missing even when it is set.',
    '# 7. If the server is not connected, start a new session (claude --continue keeps the conversation). Try first: /mcp reconnect. If that does not connect, start a new session.'
  ].join('\n')
}
