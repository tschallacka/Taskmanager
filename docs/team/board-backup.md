---
title: Back up a board
summary: Download a board as one JSON file, with its dates and authors. What the file holds depends on who asks
topics: backup, export, download, json, archive, board, copy, safekeeping, format, agent, key
order: 150
---

A **backup** is one file that holds a board: its cards, comments, and the rest of what you can see on it. Every
item keeps its original date and its author, to the millisecond. Keep it for safekeeping, or to move the board
somewhere else later. An agent that needs a board's content can take one backup instead of reading every card.

## Download one

1. Open the board and go to **Settings**, then **General**.
2. Under **Backup**, press **Download backup**.

The browser saves a file named after the board and the day, for example `my-board-backup-2026-11-08.json`.

## Who gets what

Anyone who can open a board can download it. The file holds exactly what that person can see on the board, and
nothing more.

- **Team members** get the whole board: every card, subtask, label, custom field, comment (internal and
  customer-visible), activity line, time log, status update, message, rule, and the trash.
- **Customer contacts and guests** get only the cards marked visible to customers, and the comments on them that
  are visible to customers. They get no time logs, rules, status updates, messages, custom fields, trashed items,
  internal comments or internal activity. Team members' email addresses are left out; people appear by name.
- **Agent keys** with read access to the board get the same as the person they belong to: a key that belongs to a
  team member gets the whole board, and a key limited to a customer's cards gets the customer's view.
- **Crew keys** read another board like a customer's contact: they get the customer view, so a crew's internal
  notes stay inside the crew. On the crew's **own** board (its shadow board, or the board it was made on) a crew
  key gets the whole board as an admin would, so the crew can move it and restore it. Email addresses there
  still follow each person's own visibility setting.

A board you cannot see answers as if it did not exist: you get the same "not found" as when you open the board.

## Keys

To let an agent take a backup, give its key **Read boards**. No other permission is needed. The key then gets
exactly what the rules above give the key's owner, or for a crew key the customer view (the whole board on the
crew's own board).

## Saving time on repeat downloads

Each download carries a checksum, sent as its `ETag`. An agent that keeps the last `ETag` and sends it back as
`If-None-Match` gets `304 Not Modified` with no body when the board has not changed. Those answers do not count
against the limit below.

## Limits

- One download at a time per board, for each person or key. A second one while the first runs is refused.
- Six downloads per hour per board, for each person or key. The seventh is refused with `429`, and the response
  says how many seconds to wait in its `Retry-After` header. Instance admins are not limited.

## What is in the file

- **Columns**: name, colour and position. Customers see the live columns only.
- **Board**: name, description, status, dashboard widgets, label colours, whether it is archived. Team members
  also get the custom field definitions.
- **Cards**: title, description, labels, visibility (team only or customer), assignee, dates, completion, position,
  parent card, what it is blocked by, custom field values (team members), GitHub links, and whether it is in the
  trash (team members only).
- **Comments** on each card, internal or customer-visible, with who wrote them and when they were last edited.
- **Activity** of each card. Customers do not get the lines about who a card is visible to.
- **Time logs**, **status updates**, **messages**, **rules** (as data; an import stores them switched off): team
  members only.
- **People**: everyone the file mentions, by a name inside the file. A team member's email address is included only
  when the owner allows it.
- **Attachments**: a list of the image files of each card they can see, with size and checksum. Add
  `attachments=inline` to the address to put the image bytes in the file too. The file gets much larger.
- **Counts** of each section, and a **checksum** that proves the file has not been damaged.

## What is not in the file

- Passwords, keys, tokens, pairing codes and sign-in sessions.
- Project secrets and their values.
- Push subscriptions and the crew's gate settings.
- Your personal pins of boards. A pin belongs to one person, not to the board.
- Live GitHub state. A GitHub link is kept as the address and the number only, and only where the viewer may see it.

## Taking part of a board

Two addresses limit what a backup holds. Both take a list separated by commas:

- `?only=` with card ids: only those cards, with their comments and attachments.
- `?columns=` with column names: only the cards in those columns.

When either is used, the file holds only the cards, not the board's status updates, messages and rules.

## The format

The file is version 1 of the format `taskmanager-board-backup`. The fields and their types are written in
`shared/backup/schema.ts`, with the same rules as a JSON Schema. Every reference (a card's column, its assignee,
a comment's author) names something inside the same file, so the file can be read on its own.

The timestamps are milliseconds since 1 January 1970 in UTC, as the database stored them. An empty one is `null`.
A date that is a calendar day (a due date, a time log's day) is written as `YYYY-MM-DD`.
