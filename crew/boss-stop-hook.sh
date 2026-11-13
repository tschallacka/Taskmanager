#!/bin/sh
# Claude Code Stop hook for Boss's session: Boss must not end a turn while one of the two crew watches is down.
# The watches run as Monitor tasks, and each expires after 30 minutes and must be re-armed:
#   crew boss-mentions   posts by Pia, Susy and Rita that tag Boss
#   crew watch-crew      Pia's session and listener, and Susy, alive and working
# When one is missing, the stop is blocked with the Monitor call to make. When stop_hook_active is already true, it lets
# Boss stop, so it can never loop. Usage: boss-stop-hook.sh <crew home> <kit folder>, as init.mjs writes it into Boss's
# .claude/settings.local.json. Prints nothing and exits 0 when both run.
CREW="$1"
KIT="$2"
INPUT=$(cat)

monitor() {
  # $1 the kit command, $2 the Monitor description. Printed as the Monitor call Boss makes to re-arm the watch.
  printf 'Monitor(command: "CREW_HOME=%s node %s/crew.mjs %s", description: "%s", timeout_ms: 1800000);' "$CREW" "$KIT" "$1" "$2"
}

missing=""
pgrep -f "crew.mjs boss-mentions" >/dev/null || missing="$missing $(monitor boss-mentions "@boss mentions from Pia, Susy and Rita on the crew board")"
pgrep -f "crew.mjs watch-crew" >/dev/null || missing="$missing $(monitor watch-crew "Pia and Susy keep working (alerts only on trouble)")"
[ -z "$missing" ] && exit 0
case "$INPUT" in *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0 ;; esac

# JSON-escape the backslashes and double quotes of the instruction.
reason=$(printf 'A crew watch is not running. Re-arm it before you stop:%s' "$missing" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"decision":"block","reason":"%s"}\n' "$reason"
exit 0
