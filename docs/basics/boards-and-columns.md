---
title: How a board works
summary: What a board, its columns and its tasks are, which views a board has, and what the numbers in the header mean
requires: staff
topics: board, project, columns, tasks, cards, views, kanban, overview, list, timeline, calendar
order: 10
---

A **board** (the app also calls it a **project**) is where one piece of work lives. It holds **columns**, the stages
the work moves through, and each column holds **tasks**, shown as cards. You move a card from column to column as the
work moves on.

## What is on a board

- **Columns** are the board's sections, such as *Backlog*, *To do*, *Verify* and *Done*. You name them, colour them,
  reorder them and delete them. See [Columns and the trash](/help/basics/columns-and-trash).
- **Tasks** are the cards. A task has a title and a description, and can carry labels, an assignee, a start and a due
  date, a done mark, subtasks and more. See [Create and edit tasks](/help/basics/tasks).
- A board belongs to your team, or to your own workspace when you are not in a team. Everyone in the team can open it.
  A board can also be filed under one of the team's customers, which is what lets that customer's contacts see the
  tasks you share. See [Who sees a task](/help/basics/task-visibility).

A new board starts with four columns: **Backlog**, **To do**, **Verify** and **Done**. If your team has chosen its own
set, new boards start with that set instead; the owners and admins of the team choose it in the team's settings. Either
way you can rename, add and remove columns at any time.

## The tabs

Under the board's name is a row of tabs. They are different ways of looking at the same tasks.

| Tab | What it shows |
|---|---|
| **Overview** | The board's description, its health status and its status updates. |
| **Board** | The columns and cards. This is where a board opens. |
| **List** | The tasks as rows, one section per column, with a cell for each custom field. |
| **Timeline** | A bar for each task that has a start or a due date. |
| **Calendar** | Tasks on the day they are due. Drag a task onto a day to set its due date. |
| **Dashboard** | Counts and charts: completed, incomplete and overdue tasks, and tasks per column. |
| **Messages** | Conversations for the team only. See [Board messages](/help/basics/board-messages). |
| **Time** | Time logged on the board's tasks, a week at a time. |
| **Files** | Every image pasted into a task description on the board. |

**Settings** is the cog at the top right, next to **Share**. The **...** menu (*Project options*) next to it holds
*Rename project*, *Settings* and, when something has been deleted, *Show trashed*.

## The numbers in the header

The header shows something like **8/47 tasks**: 8 open of 47 in total. Hover it for the words. "Open" is worked out
from the columns, not from the done mark:

- A column counts as an **ending** column when its name contains *done*, *shipped*, *complete*, *closed*, *live*,
  *cancel*, *reject*, *dropped* or *archive*. Mind that it is a text match: a column called *Delivery* counts, because
  it contains "live".
- When no column matches, the last column is the ending one.
- A board with a single column has no ending, so it shows the plain total.

Tasks in an ending column are not counted as open. The same count is shown under each board's name in the sidebar.
The *All projects* page counts differently: it counts a task as open until it has the **done mark**.

## Good to know

- Changes made by teammates, by an agent or by the AI assistant show up on an open board without a reload.
- A board you open from a crew can say *This is a crew's board. You can read it here; only the crew's team changes
  it.* You can look but not change anything on it.
- There is no separate permission for boards. Everyone in the team, not only owners and admins, may create, rename,
  archive and delete a board.
- Read [Create and manage a board](/help/basics/create-and-manage-a-board) to make one, or
  [Run a small project from start to finish](/help/basics/run-a-small-project) for the whole route in one go.
