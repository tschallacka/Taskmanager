---
title: Share a board by public link
summary: Give anyone a read-only view of a board with a link, set an end date, and stop sharing again
requires: staff
topics: share, public link, public board, read-only, link, end date, stop sharing, anyone with the link
order: 100
---

A **public link** lets someone look at a board without an account: a customer's boss, a stakeholder, a supplier. They
see the board and the tasks you have shared, and cannot change anything.

Check [Who sees a task](/help/basics/task-visibility) first. The public link shows every task that is **Shared with
customer**, and that is the setting a new task starts with.

## Turn sharing on

1. Open the board and click **Share** (the share icon) at the top right.
2. Optionally pick an **End date**. Leave it empty to share indefinitely.
3. Click **Share board**. A message says *Board is shared*.
4. The panel now shows **Link is active**, the link and when it expires. Click **Copy link** to copy it.

The link looks like `/public/project/` followed by the board's id, on your instance's address. The button turns into a
globe icon while a board is shared, so you can see it at a glance in the header.

## Change or end the share

- To change the end date, open **Share**, pick a date and click **Save changes**. The date must be in the future.
  The share is open through the end of that day.
- To close it, click **Stop sharing**. The link stops working at once, and anyone looking at the board is cut off.
- Someone opening a link that is stopped, expired or wrong sees *This board is not available or has been made
  private.*
- When the end date passes, the link stops working by itself. The board stays shared in the panel until you stop it,
  but nobody can open it. Pick a new date to open it again.

## What a reader sees

A reader of the public link sees:

- The board's name, its columns and their colours, and the cards in them.
- For each card its title, its **description** (with images, tables, code, charts and diagrams), and its labels. They
  can open a card to read it larger.
- The count of open tasks in the header, worked out the way it is for you.

A reader does **not** see: Team only tasks, subtasks, comments, assignees, dates, custom fields, the trash, the
messages, anything about time or settings, or other boards. The page updates by itself when the board changes, and has
no way to edit.

Images in a task's description are served to the public too, but only the images of tasks that are shared.

## Good to know

- Anyone who has the link can open it, and can pass it on. There is no password. Treat the link like a key.
- Making a task **Team only** takes it off the public page right away.
- Anyone in your team can share a board, not only owners and admins.
- Sharing a board is separate from filing it under a customer. A customer's contact logs in and can comment and add
  tasks; a public reader cannot do either.
- Deleting the board ends the share too.
