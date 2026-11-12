---
title: Subtasks, blockers and custom fields
summary: Break a task into a checklist, say which tasks must finish first, and add fields such as Priority to every task
requires: staff
topics: subtasks, checklist, blocked by, blockers, dependencies, custom fields, priority, estimate, dropdown
order: 50
---

Three ways to say more about a task than a title and a description. All three live in the task's panel; custom fields
are set up once per board in **Settings**.

## Subtasks

A **subtask** is a small step inside a task, such as one item of a checklist. Subtasks are not cards on the board; they
live in the task's panel under **Subtasks**, and the parent card shows a count such as 2/5.

1. Open the task and type in **Add a subtask...**, then press Enter.
2. Press **Enter** inside a subtask to finish it and start the next one right under it.
3. Click the circle to tick a subtask off. The heading shows how many are done.
4. Drag the grip at the left to reorder; the **x** on the right removes one.

Subtasks can be nested. **Tab** puts a subtask under the one just above it; **Shift+Tab** brings it back out one level.
A nested subtask can only live inside its own task: you cannot move it to another card, and a subtask cannot become a
card of its own.

Things to know:

- A subtask moves with its parent and always sits in its parent's column.
- A subtask made under a task that is **Team only** is Team only too. See [Who sees a task](/help/basics/task-visibility).
- **Removing a subtask is final.** There is no trash and no undo, and removing one takes the subtasks nested under it
  along. Deleting the parent task is different: it goes to the trash, and its subtasks come back with it.
- The description editor also has a **Task list**, a checklist inside the text. It is separate from subtasks, and
  shows as a `done/total` count on the card.

## Blocked by

Sometimes a task cannot start until another one is finished. In **Blocked by** you list the tasks this one waits for.

1. In the panel, under **Add a task this one waits for**, type part of a title on this board.
2. Click the task you mean. It joins the list; click the **x** next to it to stop waiting for it.

Rules the app enforces, with a message that says which one you hit:

- Both tasks must be on the same board.
- A task cannot wait for itself, and cannot wait for the same task twice.
- No loops: if A waits for B, B cannot wait for A, directly or through other tasks.

**Blocking** is the other side of the same link: under the task panel's **Blocking** section you see the tasks that wait for this one, each one a link that opens it, with whether it is open or finished. When this task is finished, they read as now free. You add and remove the links in the waiting task's own **Blocked by**, not here.

A task is **blocked** while any task it waits for is still open. The card shows a chip, **Blocked by 2** (or just
**Blocked**), and the panel says how many are still open. A blocking task counts as finished when its column is an
ending column (see [How a board works](/help/basics/boards-and-columns)), when it has the done mark, or when it is in
the trash. Restoring a trashed blocker makes the task blocked again, because nothing is stored: the state is worked
out each time.

Only the team adds or removes these links. A customer's contact can see that a task is blocked but only the titles of
blockers that are shared with them; others read as *a hidden task*.

## Custom fields

Custom fields are extra values every task on the board can have: a priority, an estimate, a client reference.

1. Open **Settings**, then **Custom fields** in the list on the left.
2. Use one of the ready-made buttons, **Priority** (a dropdown with Low, Medium and High) or **Estimate (hours)** (a
   number), or make your own: type a name, pick a type and click **Add**.
3. The types are **Text** (up to 500 characters), **Number**, **Dropdown** and **Date**. For a dropdown, type its
   choices in **Options, comma separated**.

Each task's panel now shows the fields under the dates. The **List** tab has a column for each field, editable in the
row. A dropdown's choice also appears as a coloured chip on the card.

Limits and warnings:

- A board has at most 20 fields, names are up to 40 characters, and two fields cannot share a name.
- A field's type cannot be changed afterwards.
- **Deleting a field deletes every task's value for it.** Click the bin, then **Delete?** to confirm.
- The Settings page offers adding and deleting only; there is no button to rename a field or edit a dropdown's
  choices there.
- Customers never see custom fields.
