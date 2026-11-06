---
title: Create and edit tasks
summary: Add a task to a column, open it, fill in its details, move it, label it, assign it, date it and mark it done
requires: staff
topics: task, card, create task, edit task, move task, labels, tags, assignee, due date, start date, done, mark done, filter
order: 40
---

A **task** is one card on a board. This page covers making tasks and filling in everything a task can hold, except
subtasks, blockers and custom fields, which have [their own page](/help/basics/subtasks-blockers-and-fields).

## Add a task

1. In a column, click **Add task** at the bottom (or the **+** in the column's header).
2. Type a title. Press **Enter** to add it; the box stays open so you can add several in a row. Press **Shift+Enter**
   for a new line in the title.
3. Press **Escape** to close the box without adding what is in it. Clicking away adds what you typed.

A task is just a title to begin with. A card is added at the bottom of its column. You can also press **n** on the
board to start a card in the column your keyboard is on, or in the first column when nothing is selected.

By keyboard you can move between cards with the arrow keys, open one with **Enter** and let go with **Escape**.

A task you add is **Shared with customer** by default. If the board belongs to a customer, that customer can see it. Read
[Who sees a task](/help/basics/task-visibility) before you add sensitive work.

## Open a task

Click a card (or press Enter on it). The task opens in a panel on the right. Drag its left edge to make it wider; the
width is remembered. Close it with the **X**, with Escape or by clicking outside it. Title and description save by
themselves a moment after you stop typing, so there is no Save button.

An open task has its own address, `/projects/<board>/<task>`, so you can bookmark it or send it. Opening a task
changes the address without reloading the page, and Back and Forward close and reopen the panel. **Copy link**, the
link icon in the panel's top bar, copies that address; a card and a subtask have a copy link button too. Someone who
can see the board and opens the address gets the task; someone who cannot sees a note that the task is not on the
board. An older `?task=` link still opens the task, and its address is changed to the new form.

From top to bottom the panel has:

- **Mark done** and the **column button** (the task's current column) at the top, then the visibility button, the
  **...** menu and the **X**.
- The **title**, then the labels.
- **Assignee**, **Start date** and **Due date**, then any custom fields.
- **Blocked by**, time tracking and **Subtasks**.
- The **description**, in a rich editor: see [Write in the editor](/help/basics/the-editor).
- **Comments**: see [Comments and updates](/help/basics/comments-and-updates).

## Move a task

- **Drag** the card to another column, or up and down inside its column. On a touchscreen, press and hold the card
  briefly before you drag.
- Or open the task and use the column button at the top left: it lists the columns, and the task goes to the **bottom**
  of the one you pick.

A task's subtasks always move with it. Moving a card is also noted in the task's activity log.

## Mark a task done

The circle at the left of a card's title is the **done mark**. Click it to tick the task off without opening it; click
it again to undo. In the panel the same thing is the **Mark done** button, which then reads **Done**.

The done mark is separate from the column. Ticking a task does not move it, and moving it into *Done* does not tick
it. A ticked task is greyed out, and overdue dates stop turning red.

## Assign a task

Click the round person button at the foot of a card, or **Assignee** in the panel, and pick someone, or
**Unassigned**. You can pick the team's members and, if the board is filed under a customer, that customer's contacts,
who are marked *(customer)*. The person you assign is told, unless it is you.

## Start and due dates

Pick **Start date** and **Due date** in the panel; the **x** beside a date clears it. A due date turns red on the card
once it has passed and the task is not done. The **Timeline** tab draws a bar from the start to the due date and the
**Calendar** tab puts the task on its due day. If a task has no due date, the soonest `@date` written in its
description stands in for it on the card.

## Labels

Labels are short words, such as *bug* or *design*, that you can filter by.

- In the panel click **Add a label...** and type. **Enter** or a comma adds it; Backspace on an empty box removes the
  last one. Focus the box to see the board's existing labels and pick one, so you do not end up with *bug* and *bugs*.
- Labels are saved in lower case, a task holds at most 10, and a card shows the first three.
- **Right-click** a label and pick a colour to colour that label on the whole board, or **Automatic** to go back to the
  colour its text gives it.
- Once a board has labels, a **Labels** button appears at the top of the board. It lists each label with how many tasks
  carry it. Tick some to show only tasks that carry **every** label you ticked, so ticking more narrows the board down; **Clear**
  shows everything again. The filter is
  forgotten when you open another board.

## Delete a task

**...** (*Task options*), **Delete task**. It goes to the trash for 7 days, and **Undo** is offered for a few seconds.
See [Columns and the trash](/help/basics/columns-and-trash).
