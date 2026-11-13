# claude-long-run.json: what each value does

JSON cannot hold comments, so this file explains the profile line by line. The profile is `claude-long-run.json` in
this folder. A session gets it only when it is started with `--settings <that file>` (`crew claude`, or the start
line in PROMPTS.md "Starting Pia"). Other sessions are not changed.

| Variable | Value | Meaning |
|---|---|---|
| `BASH_DEFAULT_TIMEOUT_MS` | 1800000 (30 min) | A shell command that names no timeout may run this long (default 2 min). |
| `BASH_MAX_TIMEOUT_MS` | 7200000 (2 h) | The longest a shell command may ask for. |
| `CLAUDE_CODE_AUTO_BACKGROUND_TIMEOUT_MS` | 1800000 (30 min) | A foreground shell command moves to the background after this long (main session). |
| `BASH_MAX_OUTPUT_LENGTH` | 150000 | Characters of shell output read back. Claude Code caps it at 150,000; a higher value is refused. |
| `MCP_TIMEOUT` | 60000 (60 s) | How long an MCP server may take to start. |
| `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS` | 600000 (10 min) | An MCP tool call moves to the background after this long (default 2 min). `0` turns it off. |
| `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` | 1800000 (30 min) | An MCP tool call with no progress is given up after this long (stdio default 30 min, remote 5 min). `0` is off. |
| `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` | 3600000 (1 h) | A background agent is counted as stalled after this long without output (default about 10 min). |

Not in the profile, because they cannot be raised: the Monitor watch limit (30 min at most; re-arm the watch, or use
`persistent` where the session offers it) and nothing else. Values may change with Claude Code versions; the profile
was checked against Claude Code 2.1.319 on 2026-11-09.
