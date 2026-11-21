#!/bin/sh
# A tester's own copy of ANY card branch, so testing never waits for the worker (owner, 2026-11-11). Kit file: run from the
# kit folder (sh <kit>/tester-copy.sh ...), like session-wake.sh; nothing is copied into the crew home.
# usage: sh tester-copy.sh start  <quincy|usher|pat|nina> <branch on origin, for example wade/mw99...-mobile-settings-back> [keep]
#        sh tester-copy.sh stop   <key>
#        sh tester-copy.sh status <key>
# What start does: refreshes origin (run git_pull first for a branch pushed in the last minutes), puts a detached
# worktree <repo>-<key>-qa on origin/<branch>, installs dependencies, makes a FRESH database arnotes_dev_<key> (with
# "keep" the database is left as it is), starts the dev copy in the background and prints its URL once it answers.
# The port of each tester comes from crew.json (devServers.<key>), never from this file. The first account you sign up on
# a fresh database is that copy's instance admin. Log: work/<key>/dev.log.
# Never touches a worker's worktree, branch or database, or arnotes, or live.
set -e
CMD="$1"; KEY="$2"; BRANCH="${3:-}"; KEEP="${4:-}"
case "$KEY" in
  quincy|usher|pat|nina) ;;
  *) echo "usage: sh tester-copy.sh <start|stop|status> <quincy|usher|pat|nina> [branch] [keep]" >&2; exit 64 ;;
esac
HOME_DIR="${CREW_HOME:-$(cd "$(dirname "$0")/.." && pwd)}"
REPO="${CREW_REPO:-/srv/agents/taskmanager-maintenance/taskmanager}"
WT="$REPO-$KEY-qa"
DB="arnotes_dev_$KEY"
WORK="$HOME_DIR/work/$KEY"
PIDF="$WORK/copy.pid"
mkdir -p "$WORK"

# The tester's port, from crew.json devServers. Refuses when there is none, so no copy starts on a guessed port.
port_of() {
  node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const p=(c.devServers||{})[process.argv[2]];if(Number.isInteger(p)&&p>0)console.log(p)' "$HOME_DIR/crew.json" "$KEY" 2>/dev/null
}

# The folder of the process that listens on this tester's port, or nothing when the port is free.
port_owner_cwd() {
  for P in $(ss -ltnp 2>/dev/null | grep -E "[:.]$PORT " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do
    readlink "/proc/$P/cwd" 2>/dev/null
  done | head -1
}

stop_copy() {
  if [ -f "$PIDF" ]; then
    PID="$(cat "$PIDF")"
    # the whole process group: bun starts nuxt, which starts workers
    kill -- -"$PID" 2>/dev/null || kill "$PID" 2>/dev/null || true
    rm -f "$PIDF"
    echo "$KEY copy stopped"
  else
    echo "$KEY copy is not running (no pid file)"
  fi
}

case "$CMD" in
  stop) stop_copy; exit 0 ;;
  status|start) ;;
  *) echo "usage: sh tester-copy.sh <start|stop|status> <key> [branch] [keep]" >&2; exit 64 ;;
esac

PORT="$(port_of)"
[ -n "$PORT" ] || { echo "no port for $KEY in crew.json (devServers.$KEY)" >&2; exit 64; }

if [ "$CMD" = status ]; then
  OWNER="$(port_owner_cwd)"
  if [ -n "$OWNER" ] && [ "$OWNER" = "$WT" ]; then
    echo "running: http://localhost:$PORT  commit $(git -C "$WT" log -1 --format='%h %s' 2>/dev/null)"
  elif [ -n "$OWNER" ]; then
    echo "not running: port $PORT is held by another copy ($OWNER)"
  else
    echo "not running"
  fi
  exit 0
fi

[ -n "$BRANCH" ] || { echo "start needs the branch on origin" >&2; exit 64; }
stop_copy >/dev/null 2>&1 || true
sleep 2
OWNER="$(port_owner_cwd)"
if [ -n "$OWNER" ] && [ "$OWNER" != "$WT" ]; then
  echo "port $PORT is held by another copy ($OWNER). Not starting: Nuxt would fall back to another port. Ask Pia to have its owner stop it." >&2
  exit 66
fi

cd "$REPO"
git fetch -q origin 2>/dev/null || true
git rev-parse --verify -q "origin/$BRANCH" >/dev/null || { echo "no branch origin/$BRANCH (run git_pull, check the name)" >&2; exit 65; }
if [ -d "$WT/.git" ] || [ -f "$WT/.git" ]; then
  git -C "$WT" checkout -q --detach "origin/$BRANCH" -f
else
  git worktree add -q --detach "$WT" "origin/$BRANCH"
fi
cd "$WT"
echo "worktree $WT at $(git log -1 --format='%h %s')"
bun install --frozen-lockfile 2>&1 | tail -1
bunx nuxt prepare >/dev/null 2>&1 || true

# dev.env sets PORT=3000 for Boss's copy: keep this tester's port from crew.json over it.
TESTER_PORT="$PORT"
set -a
. "$HOME_DIR/dev.env"
set +a
PORT="$TESTER_PORT"
export PORT
export DATABASE_URL="postgresql://arnotes@localhost:55433/$DB"
export BETTER_AUTH_URL="http://localhost:$PORT"
if [ "$KEEP" != "keep" ]; then
  dropdb -h localhost -p 55433 -U arnotes --if-exists "$DB"
fi
createdb -h localhost -p 55433 -U arnotes "$DB" 2>/dev/null || true
bun run db:push 2>&1 | tail -1

setsid bun run dev --port "$PORT" >> "$WORK/dev.log" 2>&1 &
echo $! > "$PIDF"
i=0
until [ "$(port_owner_cwd)" = "$WT" ] && curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/health" 2>/dev/null | grep -q 200; do
  i=$((i + 1))
  [ "$i" -gt 90 ] && { echo "copy did not answer in 7 minutes; see $WORK/dev.log" >&2; exit 70; }
  sleep 5
done
echo "READY http://localhost:$PORT  branch $BRANCH  commit $(git log -1 --format=%h)  database $DB (fresh unless keep)"
