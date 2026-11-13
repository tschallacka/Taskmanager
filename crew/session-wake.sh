#!/bin/sh
# Types one text into a live session by its recorded id (card mwdblb506deyxnet5i7). The caller (crew/wake.mjs) has already
# checked that the id is live and that the session is idle. usage: sh session-wake.sh <session id> <text>
# Same method as bin/susy-wake.sh: attach to the id, paste the text, press Enter, leave. Attach is by id, never by name.
B=${SESSION_WAKE_MCP:-/srv/agents/taskmanager-maintenance/.config/tsch-ai-skills/bin/interactive-shell-mcp}
S=sessionwake
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"wake","version":"1"}}}'
DONE='{"jsonrpc":"2.0","method":"notifications/initialized"}'
call() {
  printf '%s\n%s\n%s\n' "$INIT" "$DONE" "$1" | timeout 40 "$B" 2>/dev/null | tail -1
}
tool() { call "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":$2}}"; }
ID="$1"
TEXT="$2"
[ -n "$ID" ] && [ -n "$TEXT" ] || { echo "usage: sh session-wake.sh <session id> <text>" >&2; exit 64; }
# The id goes into `exec claude attach $ID`, a shell command, so it must be a session id (hex, or UUID groups) before
# any tool is called. Anything else is refused here, the same rule as validSessionId in crew/session.mjs.
printf '%s' "$ID" | grep -Eq '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4,12}){0,4}$' || { echo "refused: not a session id" >&2; exit 64; }
tool shutdown "{\"session\":\"$S\"}" >/dev/null 2>&1 || true
# A step counts only when the tool answered without an error: a failed paste exits 1, so the caller counts it.
ok() {
  case "$1" in
    '') return 1 ;;
    *'"isError":true'*|*'"error"'*) return 1 ;;
  esac
  return 0
}
leave() { tool shutdown "{\"session\":\"$S\"}" >/dev/null 2>&1 || true; }
out=$(tool start "{\"session\":\"$S\",\"command\":[\"bash\",\"-c\",\"exec claude attach $ID\"]}")
ok "$out" || { echo "could not start the attach for session $ID" >&2; leave; exit 1; }
sleep 7
args=$(node -e 'console.log(JSON.stringify({session:process.argv[1],text:process.argv[2]}))' "$S" "$TEXT")
out=$(tool paste "$args")
ok "$out" || { echo "paste into session $ID failed" >&2; leave; exit 1; }
out=$(tool key "{\"session\":\"$S\",\"key\":\"ENTER\"}")
ok "$out" || { echo "Enter into session $ID failed" >&2; leave; exit 1; }
sleep 3
tool key "{\"session\":\"$S\",\"key\":\"LEFT\"}" >/dev/null
sleep 1
leave
echo "typed into session $ID"
