#!/bin/sh
# The fallback to Pia's terminal when the interactive-shell MCP connection in your session is down: it runs the
# interactive-shell MCP server for one call over stdio, the same way Boss's copy does.
#   sh pia-term.sh view [first-last]      the screen (default rows 1-40)
#   sh pia-term.sh paste "<text>"         bracketed paste, then Enter
#   sh pia-term.sh key <KEY>              one key (ENTER, ESC, ...)
# PIA_SESSION is the session name Pia's terminal has in the MCP server (default: pia).
# INTERACTIVE_SHELL_MCP is the server binary (default: the one in the tsch-ai-skills install).
# Read the screen before you type: a paste or a key goes straight into her session.
B="${INTERACTIVE_SHELL_MCP:-/srv/agents/taskmanager-maintenance/.config/tsch-ai-skills/bin/interactive-shell-mcp}"
S="${PIA_SESSION:-pia}"
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"pia-term","version":"1"}}}'
DONE='{"jsonrpc":"2.0","method":"notifications/initialized"}'
call() {
  printf '%s\n%s\n%s\n' "$INIT" "$DONE" "$1" | timeout 30 "$B" 2>/dev/null | tail -1
}
case "$1" in
  view)
    args=$(node -e 'console.log(JSON.stringify({session:process.argv[2],row_ranges:[process.argv[1]||"1-40"]}))' "$2" "$S")
    call "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"view\",\"arguments\":$args}}" \
      | node -e 'let t="";process.stdin.on("data",d=>t+=d).on("end",()=>{const r=JSON.parse(t);const inner=JSON.parse(r.result.content[0].text);for(const x of inner.responses) if(x.text) console.log(x.text)})'
    ;;
  paste)
    args=$(node -e 'console.log(JSON.stringify({session:process.argv[2],text:process.argv[1]}))' "$2" "$S")
    call "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"paste\",\"arguments\":$args}}" >/dev/null
    call "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"key\",\"arguments\":{\"session\":\"$S\",\"key\":\"ENTER\"}}}" >/dev/null
    echo pasted
    ;;
  key)
    args=$(node -e 'console.log(JSON.stringify({session:process.argv[2],key:process.argv[1]}))' "$2" "$S")
    call "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"key\",\"arguments\":$args}}" >/dev/null
    echo sent
    ;;
  *) echo "usage: sh pia-term.sh view [rows] | paste <text> | key <KEY>" >&2; exit 64 ;;
esac
