---
title: Board defaults
summary: Choose the columns every new board of your team starts with
requires: staff
topics: board defaults, default columns, starting columns, new board, columns, template, backlog
order: 35
---

When someone makes a new board in a team, the board starts with a set of columns. **Board defaults** is where
the team decides what that set is, so every new board begins the way your team works rather than with a list you
have to rebuild each time.

Out of the box the columns are **Backlog**, **To do**, **Verify** and **Done**. This is called the built-in set.

## What it covers

- It applies to **new boards of this team**, in the order shown.
- It does **not** change boards that already exist. They keep their own columns.
- It does not apply to your personal workspace. A personal board always starts with the built-in set.

## See the current defaults

Open **Team** (from the workspace menu), then **Board defaults**. The list shows the columns a new board would
start with, in order. If the team has not chosen its own, it says "Using the built-in columns." Every member of
the team can read this list.

If you are a plain member, the page ends with "Only team owners and admins change these."

<!-- requires: team-admin -->
## Change the defaults

1. Open **Team**, then **Board defaults**.
2. Change the list:
   - **Add** a column: type a name under **New column name** and click **Add**.
   - **Reorder**: use the up and down arrows (**Move up**, **Move down**) on a row.
   - **Remove** a column: click the cross (**Remove column**) on its row.
3. Click **Save**. A message confirms "Board defaults saved".

Nothing is stored until you click **Save**. **Save** stays greyed out until the list differs from what is saved,
and also while the list is empty.

### Rules for the names

- A name is at most 40 characters. The field stops you typing more.
- A list holds at most 12 columns. The server refuses more with "A new board can start with at most 12 columns."
- Names are tidied for you: leading and trailing spaces go, repeated spaces collapse to one, blank names are
  dropped.
- **Duplicates are not allowed**, and capitals do not count. "Done" and "done" are the same name. If you try to add
  one, a warning says it is already in the list.

### Go back to the built-in columns

Click **Use the built-in columns**. It saves straight away (no **Save** needed) and the page says "Back to the
built-in columns". The button is greyed out while you are already using the built-in set.

### Things that are easy to get wrong

- **A new board gets exactly this list.** If you remove "Done", new boards have no Done column, and nothing adds
  one for you.
- **Saving a change does not rename or add columns on existing boards.** To change a board you already have, edit
  that board's columns on the board.
- **Two people editing at once:** the last **Save** wins. Reload before you start if someone else may have changed
  the list.
<!-- /requires -->
