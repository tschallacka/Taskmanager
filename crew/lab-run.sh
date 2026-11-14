#!/bin/sh
# lab-run.sh <sample id> <branch> [<test file> [<repeat>]]  (card mwdkxbr0thtrcnc7mbi, slice 1)
# One sample, run by crew/lab-runner.mjs after the heavy slot is granted. A fresh detached worktree of origin/<branch>,
# install, eslint ., typecheck, a scratch database lab_<id> (dropped after), then either the whole suite and test:crew, or
# one test file run <repeat> times alone. Everything runs niced. Logs go to CREW_HOME/lab/<id>/. The last line is one
# RESULT line: `RESULT: pass|fail stage=<stage> pass=<n> fail=<n>`. Never pushes, merges, commits or edits a file in the
# repository; the only database it touches is lab_<id>.
#
# Environment: CREW_HOME (required); LAB_REPO (the clone; default the shared checkout); LAB_DB_BASE (default
# postgresql://arnotes@localhost:55433); LAB_PG (the createdb/dropdb options, default -h localhost -p 55433 -U arnotes);
# LAB_DRY=1 runs no step and reports pass at stage dry (for the tests).
set -u
ID="$1"; BRANCH="$2"; FILE="${3:-}"; REPEAT="${4:-1}"
: "${CREW_HOME:?CREW_HOME is not set}"
# The id is a folder name and the script removes folders under it (rm -rf), so it must be the shape lab.mjs writes,
# checked before anything is made or removed.
case "$ID" in
  lab-[0-9a-z]*-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
  *) echo "RESULT: fail stage=id pass=0 fail=0"; exit 0 ;;
esac
case "$ID" in *[!a-z0-9-]*) echo "RESULT: fail stage=id pass=0 fail=0"; exit 0 ;; esac
REPO="${LAB_REPO:-/srv/agents/taskmanager-maintenance/taskmanager}"
BASE="${LAB_DB_BASE:-postgresql://arnotes@localhost:55433}"
PGOPTS="${LAB_PG:--h localhost -p 55433 -U arnotes}"
DIR="$CREW_HOME/lab/$ID"
WT="$DIR/wt"
DB="lab_$(printf '%s' "$ID" | tr -c 'a-zA-Z0-9' '_')"
STAGE=start
DBMADE=0
mkdir -p "$DIR"
LOG="$DIR/run.log"
: > "$LOG"

cleanup() {
  git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1
  rm -rf "$WT"
  if [ "$DBMADE" = 1 ]; then dropdb $PGOPTS --if-exists "$DB" >/dev/null 2>&1; fi
}

# finish PASS|FAIL PASSCOUNT FAILCOUNT: prints the one RESULT line and leaves.
finish() {
  cleanup
  if [ "$1" = pass ]; then echo "RESULT: pass stage=$STAGE pass=$2 fail=$3"; else echo "RESULT: fail stage=$STAGE pass=$2 fail=$3"; fi
  exit 0
}

# step NAME CMD...: runs one step, niced, into the log; a failure ends the run at that stage.
step() {
  STAGE="$1"; shift
  echo "=== $(date +%H:%M:%S) $STAGE" >> "$LOG"
  if ! nice -n 10 "$@" >> "$LOG" 2>&1; then
    echo "=== $STAGE failed" >> "$LOG"
    finish fail 0 0
  fi
}

# counts LOGFILE: the pass and fail counts of one node or bun test run, from its summary lines.
counts() {
  p=$(grep -E '^# pass ' "$1" 2>/dev/null | tail -1 | awk '{print $3}')
  f=$(grep -E '^# fail ' "$1" 2>/dev/null | tail -1 | awk '{print $3}')
  echo "${p:-0} ${f:-0}"
}

if [ "${LAB_DRY:-0}" = 1 ]; then
  STAGE=dry
  echo "dry run of $ID ($BRANCH)" >> "$LOG"
  finish pass 0 0
fi

STAGE=fetch
step fetch git -C "$REPO" fetch -q origin

STAGE=branch
git -C "$REPO" rev-parse --verify -q "origin/$BRANCH" >/dev/null 2>&1 || { echo "origin/$BRANCH is not on origin" >> "$LOG"; finish fail 0 0; }

STAGE=worktree
git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1
rm -rf "$WT"
step worktree git -C "$REPO" worktree add -q --detach "$WT" "origin/$BRANCH"
cd "$WT" || finish fail 0 0

STAGE=install
step install bun install --frozen-lockfile
STAGE=prepare
step prepare bunx nuxt prepare
STAGE=lint
step lint bunx eslint .
STAGE=typecheck
step typecheck bun run typecheck

STAGE=database
DBURL="$BASE/$DB"
dropdb $PGOPTS --if-exists "$DB" >/dev/null 2>&1
createdb $PGOPTS "$DB" >> "$LOG" 2>&1 || finish fail 0 0
DBMADE=1
export DATABASE_URL="$DBURL" TSX_TSCONFIG_PATH=.nuxt/tsconfig.server.json
STAGE=db-push
step db-push bun run db:push

if [ -n "$FILE" ]; then
  # One file alone, REPEAT times: every run must exit 0; the counts are summed over the runs.
  STAGE=file
  TOTP=0; TOTF=0; i=1
  while [ "$i" -le "$REPEAT" ]; do
    nice -n 10 node --env-file-if-exists=.env --import tsx --test "$FILE" > "$DIR/repeat-$i.log" 2>&1
    rc=$?
    set -- $(counts "$DIR/repeat-$i.log")
    TOTP=$((TOTP + $1)); TOTF=$((TOTF + $2))
    echo "repeat $i of $REPEAT: exit $rc, pass $1, fail $2" >> "$LOG"
    if [ "$rc" -ne 0 ]; then finish fail "$TOTP" "$TOTF"; fi
    i=$((i + 1))
  done
  finish pass "$TOTP" "$TOTF"
fi

STAGE=tests
nice -n 10 bun run test > "$DIR/tests.log" 2>&1
rc=$?
set -- $(counts "$DIR/tests.log")
TP=$1; TF=$2
echo "tests: exit $rc, pass $TP, fail $TF" >> "$LOG"
if [ "$rc" -ne 0 ]; then finish fail "$TP" "$TF"; fi

STAGE=crew-tests
nice -n 10 bun run test:crew > "$DIR/crew.log" 2>&1
rc=$?
set -- $(counts "$DIR/crew.log")
echo "test:crew: exit $rc, pass $1, fail $2" >> "$LOG"
if [ "$rc" -ne 0 ]; then finish fail "$TP" "$TF"; fi

STAGE=done
finish pass "$TP" "$TF"
