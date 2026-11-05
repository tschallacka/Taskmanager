---
title: The person card and profiles
summary: Hover a person to see how many boards you share, open their profile, and (for the team) give them a task from the Draft task window
topics: person card, profile, people, avatar, hover, collaborators, assign task, draft task, view profile, shared boards
order: 110
---

The **person card** is a small panel that opens when you rest the pointer on a person's picture or name. It tells you
who they are and how much work you share. The **profile page** shows more.

## Where the card appears

The card is only on a few places:

- **Frequent collaborators** on your own **Profile** page. See [Your workspace](/help/workspace/your-workspace).
- The avatars next to a board's **Share** button, and the people listed in the **Share** dialog, for the people who see
  those.

Other avatars, such as the one on a task card, do not open it at present. Wait about a third of a second after you point at one.
The card closes when you move away.

## What the card shows

- The person's picture and name.
- Their email address, only when the server allows it (see below).
- **Collaborating with you on 3 projects**, or *1 project*. This counts the boards you can both open. An archived board is
  not counted.
- **View profile**, which opens their profile page.
- On your own avatar it says *This is you.*

## The card answers only for people you share a board with

The card and the profile page are not a directory. The server answers only for a person who can open at least one board
that you can open too. For anyone else the card says *You do not share a board with this person.*, and the profile
page says the same. It does not show a name, a picture or an address for a stranger.

Two things follow from that:

- Even for a person you share a board with, you only learn about the boards you both open, and about tasks you are
  allowed to read on them.
- A person's email address is shown to you only if you work on at least one of those boards as a team member, or if it is
  your own address. A customer's contact or a guest sees the name but no address.

## The profile page

**View profile** opens `/people/` followed by the person's id. It has no entry in the sidebar. It shows:

- Their picture and name, and the address when it is allowed.
- **Assigned tasks**: up to 30 open tasks assigned to them, on the boards you share, soonest due date first. Each row has
  the title, the board, and the due date (red when overdue). Click a row to open the task. Subtasks and finished tasks
  are not listed. If nothing is listed, it says *Nothing open that you can see.* A task you are not allowed to read does
  not appear and is not counted.
- **Projects in common**: the boards you share, each a link.

<!-- requires: staff -->
## Give someone a task

On a board you work on as a team member, you can hand a person a task from their card or profile.

1. Hover the person and click **Assign task** on the card, or open their profile and click **Assign task** under their
   name. The button is missing on your own card, and when none of the boards you share with them is one you work on
   as a team member.
2. The window **Draft task** opens. Type a **Task name**. The button **Create task** stays off until you do.
3. Under the name, the line *For (person) in (board)* has a menu with the boards you share and work on. It starts on the
   board you have open, if it is one of them, and otherwise on the first in the list.
4. Optionally write a **Description**. It is a plain box, without the editor's toolbar.
5. Click **Create task**. A message says *Task given to (person)* and has an **Open** button that goes to the task.

The task is placed in the board's first column and assigned to the person. It has no due date and no labels. Its
visibility is the default for any new task: **Shared with customer**. Change it afterwards if the task is internal; see
[Who sees a task](/help/basics/task-visibility). The person gets the usual notice for an assignment.

The window is a shortcut for adding a task and picking an assignee. For anything more, such as a due date or labels,
open the task afterwards. See [Tasks](/help/basics/tasks).

If the board has no column, the window says *That board has no column to put the task in*.

To bring someone onto a board in the first place, see [Share a board with guests](/help/basics/share-with-guests).
<!-- /requires -->
