---
title: The crew monitor
summary: Whether each crew member is busy or idle, read from the board: what the desk lights in the Office show
topics: monitor, crew, busy, idle, status, office, desk light, subtask, board
order: 76
---

The **crew monitor** says whether each member of a crew is **busy** or **idle**. The Office view shows that as a light on
each desk (see [The office view](/help/agents/office-view)). The monitor reads the board. It does not ask the crew.

## The rule

A person is **busy** when either of these is true, and **idle** otherwise:

- they have a card in a working column: **In progress**, or a **Verify** column (the card waits on them);
- they have an open subtask under a card that is in a working column. The parent card may belong to someone else.

A finished card does not count. A done subtask does not count. A card in any other column does not count. The text under
the light says why: "Busy: *card* in *column*", "Busy: subtask *title* under *card*", or "Idle".

## What is not in it yet

- **Agent reports.** The monitor cannot yet see that a crew agent has stopped or gone quiet. A worker that holds a card
  and has ended shows as busy until its card moves. A "stuck?" flag comes with the agent reports.
- **Live updates by event.** The Office polls the board, so a light changes within a few seconds of the board changing,
  not at once.

Anyone who holds no working card, including a person outside the crew with a task on the board, is **idle**.

## Who can see it

Only the team's staff see the Office view and its lights. A customer's contact never does.
