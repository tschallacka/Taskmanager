---
title: Comments and updates
summary: Talk about a task under it, reply to a comment, decide whether the customer sees it, and read the task's activity log
requires: staff
topics: comments, updates, reply, activity log, internal comment, share comment, edit comment, delete comment, notifications
order: 70
---

Under a task's description is the **Comments** section: the conversation about that task, mixed with a log of what
happened to it. Agents and other tools call the same thing an **update**: a comment posted over MCP is an update, and
they show up in the same list.

## Write a comment

1. Open the task and scroll to the box at the bottom of the panel.
2. Type. **Enter** posts the comment; **Shift+Enter** starts a new line. The arrow button posts too.
3. Before you post, look at the lock beside the box. It decides who reads the comment, see below.

The box is a single line that grows. It understands a little Markdown as you type: `**bold**`, `*italic*`,
`~~strike~~`, `==highlight==`, `` `code` `` and links. Comments are stored as Markdown text, so an agent reads them
exactly as you wrote them. A comment shows the author, how long ago it was written and *(edited)* when it was changed.

## Team only or shared with the customer

The lock button next to the box has two states:

- A lock and the placeholder **Add an internal comment...** mean **Team only**. This is how every comment starts.
- An eye and **Write to the team and the customer...** mean **Shared with the customer**.

Click the button to switch before you post. A Team only comment carries a lock and **Team only** in the list, so it is
easy to see which ones a customer cannot read. When you **reply** to a comment, the reply starts with the visibility of
the comment you answer, so an answer to an internal note stays internal unless you change it.

Changed your mind later? Use the **...** on your own comment and choose **Share with customer** or **Make team only**.
Sharing a comment is not an edit, so it does not say *(edited)*.

Remember that a customer's contact only reads comments on tasks that are themselves shared. See
[Who sees a task](/help/basics/task-visibility).

## Reply, link, edit and delete

- **Reply** under a comment starts a reply: the box says *Replying to* the author, and the new comment shows a line
  pointing back at the one it answers. Click that line to jump to the original. **x** cancels the reply.
- **Copy link** gives you a link that opens the task and flashes that comment. Handy for pointing a colleague at it.
- **Edit** (in the **...** menu) turns the comment into a box. Enter saves, Escape cancels. A comment cannot be emptied
  by editing.
- **Delete** (also in the **...** menu) asks first and then removes the comment for good. There is no undo.

You can edit, share and delete only **your own** comments. That includes what an agent posted using your key, which
is yours to clean up. A teammate's comment can be replied to but not changed.

## Who is told

A new comment notifies the task's assignee, the person who created the task and everyone who has already commented, in
the **Inbox**, except you. A Team only comment is only sent to teammates. Mentioning a person with `@Name` also tells
them if they have an agent connected.

## The activity log

Between the comments the panel lists what happened to the task, in time order, each line with who did it and when:

- created, marked done, reopened
- moved from one column to another
- assigned to someone, or the assignee removed
- start date or due date set or cleared
- renamed, or made Team only or shared
- a *Blocked by* link added or removed

A line says *(via an agent)* or *(via the AI assistant)* when it was not a person using the app, and *Rule: name* when
one of the board's rules made the change. These lines are not comments: you cannot edit or delete them.

## Comments versus Messages

Comments belong to one task. For a conversation about the whole board, use [Board messages](/help/basics/board-messages).
