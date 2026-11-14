// The one-line crew update: the shell script served at /crew/update.sh. It fetches this instance's kit
// and runs the kit's own update.mjs from that fresh copy, so an old kit without update.mjs can update too.
// The command itself is written once, in shared/utils/crewUpdate.ts.
import { crewUpdateCommand, crewUpdateOrigin } from '../../shared/utils/crewUpdate'

export function crewUpdateScript(origin: string): string {
  const url = crewUpdateOrigin(origin)
  const usage = crewUpdateCommand(url)
  return `#!/bin/sh
# Updates a crew to this Taskmanager's crew kit. Nothing interactive, and no secret is printed.
# Usage: ${usage}
# The kit folder is the one the crew home recorded in crew-kit.json (kit), else ~/crew-kit-<host>.
set -eu
ORIGIN='${url}'
HOST=$(printf '%s' "$ORIGIN" | sed -e 's|^[a-z]*://||' -e 's|/.*||')
HOME_ARG="\${1:-}"
if [ -z "$HOME_ARG" ]; then
  echo "usage: ${usage}" >&2
  exit 64
fi
CREW_HOME_DIR=$(cd "$HOME_ARG" && pwd)
if [ ! -f "$CREW_HOME_DIR/crew.json" ]; then
  echo "crew update: $CREW_HOME_DIR has no crew.json, so it is not a crew home" >&2
  exit 64
fi
KIT=""
if [ -f "$CREW_HOME_DIR/crew-kit.json" ]; then
  KIT=$(node -e 'const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); if (m.kit) process.stdout.write(m.kit)' "$CREW_HOME_DIR/crew-kit.json" 2>/dev/null || true)
fi
[ -n "$KIT" ] || KIT="$HOME/crew-kit-$HOST"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL -D "$TMP/headers" -o "$TMP/kit.tar.gz" "$ORIGIN/crew/kit.tar.gz"
VERSION=$(tr -d '\\r' < "$TMP/headers" | grep -i '^x-crew-kit-version:' | sed 's/^[^:]*: *//' | tail -1)
mkdir "$TMP/kit"
tar -xzf "$TMP/kit.tar.gz" -C "$TMP/kit"
rm -f "$TMP/kit.tar.gz"
printf '%s\\n' "\${VERSION:-unknown}" > "$TMP/kit/KIT-VERSION"
CREW_HOME="$CREW_HOME_DIR" node "$TMP/kit/update.mjs" --from "$TMP/kit" --kit "$KIT"
`
}
