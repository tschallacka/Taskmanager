#!/bin/sh
# Keeps a command running in a detached tmux session, so it outlives the session that started it (a restart of
# Boss's Claude Code session no longer ends it). The `up` list in crew.json calls this for Pia and for the dev services.
#   sh detach.sh check <socket> <name>             exit 0 when the session <name> exists on <socket>
#   sh detach.sh start <socket> <name> <command>   starts <command> in a detached session <name>, unless it exists
# The socket is a path of its own (for example $CREW_HOME/tmux.sock), so the crew's sessions never mix with anyone
# else's tmux. TMUX_BIN overrides the tmux binary (default: tmux on the PATH).
TMUX_BIN="${TMUX_BIN:-tmux}"
case "$1" in
  check)
    [ -n "$2" ] && [ -n "$3" ] || { echo "usage: sh detach.sh check <socket> <name>" >&2; exit 64; }
    "$TMUX_BIN" -S "$2" has-session -t "$3" 2>/dev/null
    ;;
  start)
    [ -n "$2" ] && [ -n "$3" ] && [ -n "$4" ] || { echo "usage: sh detach.sh start <socket> <name> <command>" >&2; exit 64; }
    if "$TMUX_BIN" -S "$2" has-session -t "$3" 2>/dev/null; then
      echo "already running"
      exit 0
    fi
    "$TMUX_BIN" -S "$2" new-session -d -s "$3" "$4" && echo started
    ;;
  *)
    echo "usage: sh detach.sh check <socket> <name> | start <socket> <name> <command>" >&2
    exit 64
    ;;
esac
