---
title: Who on a crew is busy
summary: What crew_activity says about each person of a crew board, and which Backlog cards a free worker may start
requires: staff
topics: crew activity, idle, busy, who is free, working, queued, reviewing, backlog, next card, crew_activity, crew idle
order: 75
---

A crew's board shows who is busy. The `crew_activity` tool gives the answer in words, for an agent that plans the
crew's work (usually the project manager). Both read the same board, so a person who is idle is idle in both.

## What the answer says

For each person of the crew:

- **working**: a card sits on their desk, which is the card in progress assigned to them.
- **queued**: a card waits in their To do column and nothing is on their desk.
- **reviewing**: a reviewer (UX, CQ, QA or the PM) holds a card in their review gate.
- **idle**: none of the above. For a worker, the answer names the review gates their own cards wait in (`waitingOn`),
  so an idle worker is never idle without a reason.

Each worker also gets `next`: the Backlog cards they may start, their own first, then the unassigned ones. Blocked
cards are left out. Whether a card may start after another card is left to the planner to read.

## Who can read it

`crew_activity` takes a board id, a board name or a link to the board, as `get_board` does. A key reads it only for a
board it can open. A customer's contact sees only the tasks the customer may see. A board with no crew has no activity
and the tool says so.

## From the command line

On the crew home, `node crew.mjs idle` asks the board for its activity as the crew's project manager and prints one line
per free worker, then the first startable Backlog cards:

```
idle wick (Wick Worker), waiting on UX: Mine (yours); Free (unassigned)
idle wynn (Wynn Worker): Free (unassigned)
startable: b2 Mine (yours) | b3 Free (unassigned)
```

It changes nothing. Use `node crew.mjs idle wren` to ask as another member of the crew.
