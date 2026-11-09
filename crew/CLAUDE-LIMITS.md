# Claude Code limits for a crew session

Long crew work (a full test suite, a typecheck, waiting for a board event) runs into Claude Code's default time
limits. This file says which limits exist, which can be raised, and how to raise them for crew sessions only.
The profile that raises them is `claude-long-run.json` in this folder. Checked against Claude Code 2.1.319 and the
Claude Code docs on 2026-11-09. A newer Claude Code may change these.

## Start a session with the profile

    crew claude [your other flags]

`crew claude` runs `claude --settings <kit>/claude-long-run.json` with your arguments. Equivalent, by hand:

    claude --settings /path/to/crew/claude-long-run.json [your other flags]

Only that session gets the higher limits. Every agent it starts runs inside it and inherits them. Sessions started
without `--settings` keep the defaults. A `--settings` file applies to one session only; nothing is written to your
user settings.

## Where Claude Code reads its environment from

Tested on 2.1.319:

1. **The environment the session starts in** (shell exports, a wrapper, `env VAR=value claude ...`). This always
   works. `claude doctor` reports bad or capped values from here (for example "Capped from 999999 to 150000").
2. **The `env` block of a settings file**: `~/.claude/settings.json` (every session of the user),
   `.claude/settings.json` and `.claude/settings.local.json` in the folder the session starts in, and a `--settings`
   file (that session only). These win over the shell's value. `claude doctor` does not show them. Check from inside
   the session with a Bash call: `echo $BASH_DEFAULT_TIMEOUT_MS`.
3. **Not a `.env` file.** Claude Code ignores a `.env` in the folder it starts in.

## The limits

| What | Default | Variable | Profile value | Hard maximum in the code |
|---|---|---|---|---|
| A shell command (when it names no timeout) | 2 min | `BASH_DEFAULT_TIMEOUT_MS` | 30 min | none of its own |
| The longest a shell command may ask for | 10 min | `BASH_MAX_TIMEOUT_MS` | 2 h | 2,147,483,647 ms (about 24.8 days, the JavaScript timer limit) |
| A foreground shell command moved to the background (main session) | off unless set | `CLAUDE_CODE_AUTO_BACKGROUND_TIMEOUT_MS` | 30 min | at least 2 s |
| Shell output read back into the conversation | 30,000 characters | `BASH_MAX_OUTPUT_LENGTH` | 150,000 | 150,000: higher values are capped |
| MCP server start-up | not documented | `MCP_TIMEOUT` | 60 s | not documented |
| One MCP tool call, start to end | about 28 h | `MCP_TOOL_TIMEOUT` (or `timeout` per server in `.mcp.json`) | unchanged | about 24.8 days |
| An MCP tool call with no progress | 30 min (stdio), 5 min (remote) | `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` (`0` = off) | 30 min | the call limit above |
| An MCP tool call moved to the background | 2 min | `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS` (`0` = off) | 10 min | about 24.8 days |
| A background agent counted as stalled | the stream watchdog + 5 min, or 10 min without the watchdog | `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` | 1 h | about 24.8 days |
| A Monitor watch | 5 min, at most 30 min (10 min in `-p` runs) | none | cannot be raised | 30 min: re-arm it, or use `persistent` where the session offers it |

## What cannot be raised

- **Monitor:** 30 minutes at most. Re-arm the watch when it expires. Some sessions offer a `persistent` option (no
  timeout; it runs until TaskStop or the session ends). Use it where it is offered.
- **Shell output:** 150,000 characters at most. Write long output to a file and read the part you need.

## A background agent ends its turn on its own

That is not a timeout, and no variable changes it. The kit handles it: a listener running in the background wakes the
agent when it ends, Pia resumes agents that hand back, and Susy reports anyone idle with work (see CREW.md).

## Versions

The values were checked against Claude Code 2.1.319. Claude Code may change any of them in a later version.
`crew update` prints the installed Claude Code version and warns when it is older than 2.1.319.
