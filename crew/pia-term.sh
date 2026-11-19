#!/bin/sh
# Pia's terminal (card mwmzv2jt, Boss ruling 2026-11-19): her Claude Code session runs in the tmux session `pia` on the
# crew's own tmux socket, the way Susy's daemon runs. This adapter is what the mailbox daemon and Boss use to read and type
# into it. `crew up pia` starts her session (pia-tmux.mjs); this file only talks to it.
#   sh pia-term.sh view [first-last]    the screen (default rows 1-40)
#   sh pia-term.sh paste "<text>"       the text, then Enter
#   sh pia-term.sh key <KEY>            one key (Enter, Escape, C-u, ...)
# CREW_HOME gives the socket (CREW_HOME/tmux.sock); TMUX_BIN overrides the tmux binary (default: tmux on the PATH).
H="${CREW_HOME:-/srv/agents/taskmanager-maintenance/.config/taskmanager-crew}"
SOCK="$H/tmux.sock"
T="${TMUX_BIN:-tmux}"
S=pia
need() {
  "$T" -S "$SOCK" has-session -t "$S" 2>/dev/null || {
    echo "pia: no terminal: session $S is not running on $SOCK" >&2
    exit 1
  }
}
case "$1" in
  view)
    need
    range="${2:-1-40}"
    first="${range%-*}"
    last="${range#*-}"
    "$T" -S "$SOCK" capture-pane -p -t "$S" | sed -n "${first},${last}p"
    ;;
  paste)
    [ $# -ge 2 ] || { echo "usage: sh pia-term.sh view [rows] | paste <text> | key <KEY>" >&2; exit 64; }
    need
    buf="crew-pia-$$"
    printf '%s' "$2" | "$T" -S "$SOCK" load-buffer -b "$buf" -
    "$T" -S "$SOCK" paste-buffer -p -d -b "$buf" -t "$S"
    # A short wait, so the Enter is read after the paste and not inside it.
    sleep 1
    "$T" -S "$SOCK" send-keys -t "$S" Enter
    echo pasted
    ;;
  key)
    [ $# -ge 2 ] || { echo "usage: sh pia-term.sh view [rows] | paste <text> | key <KEY>" >&2; exit 64; }
    need
    "$T" -S "$SOCK" send-keys -t "$S" "$2"
    echo sent
    ;;
  *)
    echo "usage: sh pia-term.sh view [rows] | paste <text> | key <KEY>" >&2
    exit 64
    ;;
esac
