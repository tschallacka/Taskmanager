---
title: Import a board backup
summary: Load a backup file into a board, or into a new one, keeping its dates and authors
requires: staff
topics: import, restore, backup, move board, json, dates, authors, dry run
order: 155
---

# Import a board backup

You can load a backup file made by **Download backup** into a board, or into a new board. The cards keep the
dates and the authors they had. Use it to move a board from one Taskmanager instance to another, or to put a
backup back.

Only the instance admin, and owners and admins of the team that owns the board, can import. Everyone else gets
a refusal. That includes members, customer contacts, guests and public visitors.

A crew may import into its **own** board: its shadow board, or the board it was made on. That lets a crew move
its work from one instance to another and restore it. A crew key is refused on every other board, and it cannot
create a new board by import.

A crew's board that you reach through the real board it works for is read-only for everyone, with one exception: the
**instance admin** can load a backup into it. Open the crew's board; the grey line at the top ("This is a crew's
board...") has a button, **Load a backup into this board**. It opens the same dialog as Board settings: pick the file,
read the dry-run report, confirm. Nobody else sees the button, and every other change to that board is still refused.

## What comes across

- **Cards**, with their columns, labels, due and start dates, completion, visibility (internal or customer),
  and their trash state. A card in the trash comes back in the trash.
- **Subtasks** stay under their parent. **Blockers** are kept between the cards of the same backup.
- **Custom fields** and the values set on the cards. A field with the same name and type on the board is used;
  otherwise it is created.
- **Updates** with their visibility, their replies, and whether they were edited.
- **Activity**, **time logs**, **status updates**, **messages** (with their replies) and **GitHub links**
  (kept as text, never fetched).
- **Rules** come in switched off. A rule that names a column or a person the board does not have is left out,
  with a warning.

Every date is kept to the millisecond. A card's date is its date in the backup, not the day you import it.

## What does not come across

- **Attachment files.** The backup lists them. The import does not copy them yet.
- **Notifications, emails, agent events, rule runs and GitHub syncs.** An import sends none of these. It also
  does not move any card or change the date of a card it does not write.

## Authors

An author is matched to a member of the board's team in one of two ways:

1. **Your choice** (`authorMap`): the backup's person, mapped to a user or an email address on the team.
2. **By email**, when the backup has the address and the team has a member with the same address.

An author that matches neither becomes **you** (the importing user). The name they had stays on the update or the
activity line, marked "imported": `Carol Outsider, imported`. An assignee that matches neither is left unassigned,
and the card gets a label `imported-assignee:<name>`. The import report lists these people.

## Two steps in the app

1. Open **Board settings**, and under **Import a backup** choose the file. You see the **report** first:
   how many cards, updates and other rows would be added, how many are already here, which people did not match,
   and any warnings. Nothing is written yet.
2. Press **Import these cards** to write it.

## Running it twice

The import remembers every card, message, status update and rule it wrote, under the backup's board and the
instance it came from. Importing the same backup again adds nothing: those rows are listed as skipped. A card that
is new in a later backup of the same board is added. Its updates and time logs are added with it.

## Through the API

`POST /api/projects/:id/import` loads into a board. `POST /api/projects/import?teamId=<team>&name=<name>` creates a
board. Send the backup as the body, with `Content-Type: application/json`. Options are query parameters:

| Parameter | What it does |
|---|---|
| `dryRun=1` | Checks the file and returns the report. Writes nothing. |
| `columnMap` | JSON object: backup column name (or id) to the board's column name (or id). |
| `onMissingColumn=create` or `fail` | A backup column with no match is created at the end (default), or the import is refused. |
| `authorMap` | JSON object: backup person to a user id or an email on the team. |
| `idempotencyKey` | Names this import. The default is the backup's board and checksum. |
| `force=1` | Accepts a file whose checksum does not match. The instance admin only. |

An API key may import when it has the write permission, reaches the board, and its owner is an admin as above,
or its owner is a crew account and the board is that crew's own.

A refusal is a 4xx response with a sentence in `message` and up to 20 problems in `data.problems`. A refused import
writes nothing. A file of up to 100 MB is accepted. The limit is set with the `IMPORT_MAX_BYTES` environment
variable. One import runs at a time per board. Each import counts against a daily limit for the board's team,
which the instance admin does not reach (see rate limits).

The response is the report: `created` (counts by kind), `skipped`, `matchedColumns`, `createdColumns`,
`mappedPeople`, `unmappedPeople`, `warnings`, and `idMap` (backup ids to new ids, for cards, columns and updates).

## Before you import

- Export the board you want to copy. Keep the file. It has the authors' names and addresses where the team may see
  them, and the board's internal notes.
- Import into an empty board, or into a board whose columns you have mapped. Cards are added below the ones already
  there.
