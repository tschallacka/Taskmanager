#!/bin/sh
# Types one text into a live session by its recorded id (card mwdblb506deyxnet5i7). The caller (crew/wake.mjs) has already
# checked that the id is live and that the session is idle. usage: sh session-wake.sh <session id> <text> [terminal name]
# Same method as bin/susy-wake.sh: attach to the id, paste the text, press Enter, leave. Attach is by id, never by name.
# The terminal name (wake.mjs passes sessionwake-<key>) only names the attach terminal, so wakes for different people
# never kill each other's terminal. Without it the name is sessionwake-<id>.
B=${SESSION_WAKE_MCP:-/srv/agents/taskmanager-maintenance/.config/tsch-ai-skills/bin/interactive-shell-mcp}
# The attach terminal is a fixed 200x50 screen: the view reads only rows that exist on it (1-50).
COLS=200
ROWS=50
# Wait for the claude prompt to show on the screen, up to PROMPT_WAIT seconds, polling every POLL seconds. A fixed sleep
# was too short under load: a busy machine showed a blank screen for longer than it waited.
PROMPT_WAIT=${WAKE_PROMPT_WAIT:-30}
POLL=${WAKE_POLL_SECONDS:-1}
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"wake","version":"1"}}}'
DONE='{"jsonrpc":"2.0","method":"notifications/initialized"}'
call() {
  printf '%s\n%s\n%s\n' "$INIT" "$DONE" "$1" | timeout 40 "$B" 2>/dev/null | tail -1
}
tool() { call "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":$2}}"; }
ID="$1"
TEXT="$2"
[ -n "$ID" ] && [ -n "$TEXT" ] || { echo "usage: sh session-wake.sh <session id> <text> [terminal name]" >&2; exit 64; }
# The id goes into `exec claude attach $ID`, a shell command, so it must be a session id (hex, or UUID groups) before
# any tool is called. Anything else is refused here, the same rule as validSessionId in crew/session.mjs.
# The test is on the whole value (case), not line by line: a newline in the id is refused too, and a leading dash, which
# claude would read as an option.
case "$ID" in
  ''|-*|*[!0-9a-fA-F-]*) echo "refused: not a session id" >&2; exit 64 ;;
esac
S="${3:-sessionwake-$ID}"
# The terminal name goes into a JSON string, so only letters, digits, dash and underscore are allowed.
case "$S" in
  ''|*[!A-Za-z0-9_-]*) echo "refused: not a terminal name" >&2; exit 64 ;;
esac
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
out=$(tool start "{\"session\":\"$S\",\"cols\":$COLS,\"rows\":$ROWS,\"command\":[\"bash\",\"-c\",\"exec claude attach $ID\"]}")
ok "$out" || { echo "could not start the attach for session $ID" >&2; leave; exit 1; }
# One look at the screen. It prints the rows, or TERMINAL-ERROR: and the tool's own error line when the terminal did not
# answer with a screen, so the reason can be shown to Boss as it is.
look() {
  out=$(tool view "{\"session\":\"$S\",\"row_ranges\":[\"1-$ROWS\"]}")
  printf '%s' "$out" | node -e 'let t="";process.stdin.on("data",d=>t+=d).on("end",()=>{let r;try{r=JSON.parse(t)}catch{console.log("TERMINAL-ERROR: the terminal did not answer");return}const res=r.result||{};const msg=(res.content&&res.content[0]&&res.content[0].text)||(r.error&&r.error.message)||"";if(res.isError||r.error){console.log("TERMINAL-ERROR: "+String(msg).split("\n")[0].slice(0,160));return}try{const inner=JSON.parse(msg);for(const x of inner.responses) if(x.text) console.log(x.text)}catch{console.log("TERMINAL-ERROR: the view answer could not be read")}})' 2>/dev/null
}
# Fail closed. Poll until the claude prompt shows (a late terminal is waited for). If the prompt never shows, the screen
# cannot be read: the reason goes to stderr, the last line of which the caller mails to Boss, and the script leaves with
# exit 3, typing nothing. A dialog on the screen is checked below (crew/modal-detect.mjs) the same way.
start_t=$(date +%s)
screen=''
why='the screen is empty'
while :; do
  look_out=$(look)
  case "$look_out" in
    TERMINAL-ERROR:*) why=${look_out#TERMINAL-ERROR: } ;;
    *)
      if printf '%s\n' "$look_out" | grep -Eq '(^|[^[:alnum:]])(❯|>) '; then
        screen=$look_out
        break
      fi
      [ -z "$look_out" ] || why='no claude prompt on the screen' ;;
  esac
  [ $(( $(date +%s) - start_t )) -ge "$PROMPT_WAIT" ] && break
  sleep "$POLL"
done
if [ -z "$screen" ]; then
  echo "SCREEN-UNREADABLE session $ID: the screen could not be read in $PROMPT_WAIT s, last answer: $why; nothing typed" >&2
  leave
  exit 3
fi
dialog=$(printf '%s\n' "$screen" | node "$(dirname "$0")/modal-detect.mjs" "$ID" 2>/dev/null)
case "$dialog" in
  PERSON-DIALOG*) echo "$dialog" >&2; leave; exit 3 ;;
  NO-DIALOG) ;;
  *) echo "SCREEN-UNREADABLE session $ID: the dialog check did not answer; nothing typed" >&2; leave; exit 3 ;;
esac
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
