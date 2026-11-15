---
title: Update a crew that already exists
summary: Bring an existing crew up to the kit your instance serves now, and add the people it is missing, without new keys for the people already working
requires: team-admin
topics: crew, update, kit, crew update, update.sh, people add, missing people, creds
order: 35
---

A crew keeps working with the kit it was made with. When your instance gets a newer version, the crew is not changed by
itself: its kit has to be updated. This page is for a crew that already exists. To make a new one, read
[Put an AI crew to work on this board](/help/crews/give-a-board-a-crew).

Updating never changes the board, the crew's keys, or the work on its cards. The state of the crew stays in its **crew
home**, the folder that holds `crew.json` and `creds.json`, and the update only replaces the kit around it.

## The quick way

Open the project list, choose **Update this crew's kit** on the crew's board, and paste the prompt it copies into the AI
agent that runs the crew. The prompt holds one line, the same one the instance serves at `/crew/update.sh`:

    curl -fsSL https://<your instance>/crew/update.sh | sh -s -- <crew home>

It works from any state: no kit folder yet, a kit from before updates existed, or a current kit. It is not interactive,
needs no token and prints no key. When it finishes it reports the kit version before and after (`X -> Y`), the crew
home it updated, and any `CONFLICT` or `FAIL` line you have to fix by hand. Then restart the Boss session so it reads
the new kit.

## From inside the kit

If the crew's kit is recent enough, `crew update` does the same from the command line:

- `crew update --check` says whether an update is waiting and writes nothing.
- `crew update` brings the kit folder up to date with the kit your instance serves.
- `crew update --from <folder or kit.tar.gz>` installs a kit you already have.
- `crew update --all` runs it once for every crew home of this kit folder.

A kit folder belongs to one instance, and an update of a kit folder that came from another instance is refused. Keep one
kit folder for each instance.

## What an update changes, and what it keeps

- **Kit files** that differ from the new kit are replaced, and files the new kit no longer ships are removed. Each one is
  copied first to `backups/update-<time>/kit` in the crew home, so a file you edited by hand is not lost.
- **The owner documents** `PROJECT-RULES.md`, `BRIEF.md` and `JANET.md` carry a marker line. The text above the marker is
  kit text and is replaced with the newest version. The text below it is yours and is never read or changed. Where the two
  disagree, the text below the marker wins. A document with no marker is migrated once: the new kit text goes above a new
  marker, and your old file is kept entirely below it, after a backup. Delete by hand what in there is only old kit text.
  An edit you made above the marker is replaced without a warning, and only the backup has it.
- **`creds.json`, `crew.json`, the browser profiles and the logs** stay as they are.
- **Skill copies** in `~/.claude/skills` are refreshed only while they still match the old kit. A copy that differs from
  both is left alone and the update prints a `WARN skill` line with the path to compare by hand.

## People the crew is missing

A crew made before a role existed (Susy, Janet, Pat, Tess, Rita) has no account for that person. `crew people add` fixes
that without touching anyone else:

1. Put the crew's management token (or the crew owner's `crews:manage` key) in `TASKMANAGER_MANAGEMENT_TOKEN`. It is never
   read from the command line.
2. Run `crew people add`, or `crew people add --people susy,janet` for only some of them.
3. It creates the missing accounts, writes **only their new keys** into `creds.json`, and prints the names it added and
   the cast, each `present` or `missing`. Existing keys are not rotated, so running workers keep working.

If nobody is missing it says "nothing to add" and changes nothing. `crew update` also checks the cast at the end when a
management token is set, and prints this command if someone is missing. It never runs it for you.

A key made on the board cannot be fetched a second time. If the board made the keys but they could not be written to
`creds.json` (a full disk, say), the command says so, and the keys are lost.

## If it goes wrong

- **`CONFLICT` or `FAIL` lines**: fix those files by hand, then run the update again. The backup folder in the crew home
  has every file as it was.
- **The update says the kit belongs to another instance**: use the kit folder of this instance, or make a new one.
- **The one line does not work**: unpack the new kit into a folder of its own, for example `~/crew-kit-new`, and run it
  against the old folder with the crew's home set:
  `CREW_HOME=<crew home> node ~/crew-kit-new/update.mjs --from ~/crew-kit-new --kit <the old kit folder>`.

<!-- requires: instance-admin -->
Instance admins: the instance serves the kit, so it always matches the version you run. See
[Crews on your instance](/help/admin/crews-on-your-instance).
<!-- /requires -->
