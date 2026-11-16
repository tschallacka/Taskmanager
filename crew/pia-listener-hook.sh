#!/bin/sh
# Claude Code hook for the PM's session (Stop and SessionStart). Pia's board listener (listen.mjs pia) must run as a
# background command of her own session: its exit is what wakes her. This hook checks for one under her session.
#   Stop:         none running -> block the stop, telling her to start it (once per stop: when stop_hook_active is
#                 already true, it lets her stop, so it can never loop; Boss's watch catches that case).
#   SessionStart: adds a line of context telling her to start it first.
# Usage: pia-listener-hook.sh <stop|sessionstart> <crew home> <kit folder>, as init.mjs writes it into
# pia-session/.claude/settings.json. Never prints a key. Exits 0 with no output when all is well.
EVENT="$1"
CREW="$2"
KIT="$3"
INPUT=$(cat)

# Pia's Claude process is an ancestor of this hook. A listener counts when that same process is its ancestor.
claude_pid=""
p=$PPID
while [ -n "$p" ] && [ "$p" -gt 1 ]; do
  case "$(ps -o args= -p "$p" 2>/dev/null)" in
    *claude*) claude_pid=$p; break ;;
  esac
  p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
done

# The listener writes its pid into CREW_HOME/.listen/pia.pid when it starts (crew/pidfile.mjs). The file names one
# process: it must be alive and still listen.mjs pia (its /proc command line), and it must be under Pia's session.
# No process scan (pgrep) is run.
has_listener() {
  [ -n "$claude_pid" ] || return 1
  l=$(cat "$CREW/.listen/pia.pid" 2>/dev/null | tr -d ' \n')
  [ -n "$l" ] && [ -r "/proc/$l/cmdline" ] || return 1
  tr '\0' ' ' < "/proc/$l/cmdline" | grep -q 'listen.mjs pia' || return 1
  q=$l
  while [ -n "$q" ] && [ "$q" -gt 1 ]; do
    [ "$q" = "$claude_pid" ] && return 0
    q=$(ps -o ppid= -p "$q" 2>/dev/null | tr -d ' ')
  done
  return 1
}

# The command Pia runs. Quoted for the shell, then escaped for the JSON the hook prints. The listener waits up to an
# hour when nothing comes (it still exits on the first event, which is what wakes her).
START="CREW_HOME='$CREW' node '$KIT/listen.mjs' pia 3600"
JSON_START=$(printf '%s' "$START" | sed 's/\\/\\\\/g; s/"/\\"/g')

case "$EVENT" in
  stop)
    has_listener && exit 0
    case "$INPUT" in *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0 ;; esac
    printf '{"decision":"block","reason":"Your own board listener is not running. Start it now with your Bash tool, run_in_background: true (never nohup): %s . Then you may stop."}\n' "$JSON_START"
    ;;
  sessionstart)
    printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"First thing: start your own board listener with your Bash tool, run_in_background: true (never nohup): %s . Its exit wakes you; start the next one each time."}}\n' "$JSON_START"
    ;;
esac
exit 0
