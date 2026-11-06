// What a person pastes on an agent's machine to connect it to this install. One copy, used by
// Settings → API keys & MCP and by Settings → Sprocket, so the two never drift apart.

/** The kit unpacks without a folder of its own, so it gets one. */
export function crewKitCommands(origin: string): string {
  return [
    'mkdir -p ~/crew-kit ~/.claude/skills/taskmanager-crew',
    `curl -fsSL ${origin}/crew/kit.tar.gz | tar -xz -C ~/crew-kit`,
    `curl -fsSL ${origin}/crew/SKILL.md -o ~/.claude/skills/taskmanager-crew/SKILL.md`,
    'cd ~/crew-kit && npm install'
  ].join('\n')
}

/**
 * Written by the shell, so $HOME is the agent machine's own. `who` is the member's key; `home` is
 * the crew's home folder, a folder of its own per crew.
 */
export function crewChannelCommand(who = 'pia', home = '$HOME/crew-home'): string {
  return `cat > .mcp.json <<EOF
{
  "mcpServers": {
    "taskmanager-crew": {
      "command": "node",
      "args": ["$HOME/crew-kit/channel.mjs", "${who}"],
      "env": { "CREW_HOME": "${home}" }
    }
  }
}
EOF
claude --dangerously-load-development-channels server:taskmanager-crew`
}

// The key lives only in the environment. The config keeps the literal `${TASKMANAGER_API_KEY}`
// (single quotes stop the shell expanding it) and Claude Code fills it in on every start.
export const KEY_VARIABLE = 'TASKMANAGER_API_KEY'

/**
 * The profile step, as shell comments at the top of a copied command, so it travels with the copy:
 * a new terminal then starts with the new key, and the comment does nothing when pasted.
 */
export const PROFILE_STEP = '# Also put the export line below in your shell profile, in place of any older TASKMANAGER_API_KEY line:\n# ~/.zshrc on a Mac, ~/.bashrc on Linux. Then open a new terminal before you start claude.'

/** Where the variable has to live, so a new terminal or a restarted agent still finds the key. */
export const KEY_VARIABLE_HOME = 'Put the export line in the shell profile of the terminal that starts Claude Code: ~/.zshrc on a Mac, ~/.bashrc on Linux. An app that starts Claude Code with environment settings of its own needs TASKMANAGER_API_KEY in those settings instead; a shell profile is not read there.'

/** Said wherever a key has just been swapped: a running session keeps the key it started with. */
export const RESTART_STEP = 'Restart Claude Code from a terminal that has the new key. A running session keeps the key it started with.'

/** Said wherever a connection may already exist. The update command itself only appears next to a key. */
export const ALREADY_CONNECTED_STEP = 'Already connected? One paste replaces the key: it sets the new key, removes the old server and adds it again.'

/** Run in each terminal Claude Code is started from, or put in the shell profile. Needs the real key. */
export function exportKeyCommand(token: string): string {
  return `export ${KEY_VARIABLE}=${token}`
}

export function mcpAddCommand(origin: string): string {
  return `claude mcp add --scope user --transport http taskmanager ${origin}/api/mcp \\\n  --header 'Authorization: Bearer \${${KEY_VARIABLE}}'`
}

/**
 * Replaces an existing connection in one paste: the new key, the old server removed, the server added
 * again. The remove fails when there is nothing to remove yet; its message is hidden and the add still
 * runs, because each line is a command of its own.
 *
 * The copied command runs as it is, so it must carry the real key. A placeholder would overwrite a
 * working key in the environment, which is why there is no default and only the key panel offers it.
 */
export function mcpReplaceCommand(origin: string, token: string): string {
  if (!token.startsWith('arn_')) throw new Error('mcpReplaceCommand needs the real key, which starts with arn_')
  return `${PROFILE_STEP}\n${exportKeyCommand(token)}\nclaude mcp remove --scope user taskmanager 2>/dev/null\n${mcpAddCommand(origin)}`
}

/** Every step at once, as instructions to paste into a Claude Code session. */
export function agentInstructions(origin: string): string {
  return `Set yourself up to work with my Taskmanager at ${origin}.

The API key is in your environment as $${KEY_VARIABLE}. Never echo it, print it or write its
value anywhere. The command below stores the variable's name, not its value, and Claude Code
fills it in every time it starts. If the variable is not set, stop and ask me to run
\`export ${KEY_VARIABLE}=<my key>\` (or put it in my shell profile) and start you again.

1. Connect its MCP server, exactly as written (the single quotes matter):
   claude mcp add --scope user --transport http taskmanager ${origin}/api/mcp --header 'Authorization: Bearer \${${KEY_VARIABLE}}'
2. Install the crew kit and its skill:
${crewKitCommands(origin).split('\n').map(line => `   ${line}`).join('\n')}
3. Read ~/crew-kit/README.md and take me through "A provisioned crew" if I want to run a crew.
   Each crew has a home folder of its own, ~/crew-home/<crew slug> (CREW_HOME); its creds.json goes
   there, never into a repository.
4. For crew channels, put a .mcp.json in the folder a crew member's session starts from, as the
   README's "Channels" section shows, with the full paths of ~/crew-kit/channel.mjs and the crew's home folder.

Ask me for anything you need, and never print the key or creds.json.`
}
