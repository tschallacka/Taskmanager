---
title: Inbox
summary: Read the notifications about your tasks, open them, and choose how else you are told
topics: inbox, notifications, unread, email, push, desktop notifications, assigned, comment
order: 20
---

The **Inbox** collects what Taskmanager wants you to know. An item arrives when something happens to a task you are
on. It is yours alone: marking an item read only changes your own inbox. The sidebar link shows how many items are
unread.

## What arrives

Each item has a title, an excerpt, the project it belongs to, and how long ago it happened.

| Kind | When you get it |
|---|---|
| Assigned | Someone assigns a task to you |
| Comment | Someone posts an update on a task you are assigned to, created, or have written on |
| Update | A task you are on is marked done, reopened, moved, or gets a new due date |

You are never told about your own actions. A person who may not see a task is not told about it either: a customer's
contact only hears about tasks shared with customers, and never about internal comments.

## Reading it

Items are grouped by the day they arrived, newest first. An unread item has a dot and a bold title.

1. Open **Inbox** in the sidebar.
2. Use **All** or **Unread** above the list to filter.
3. Click an item. It is marked read and the task opens over the inbox, in the same panel it has on its board. If the
   board lives in another workspace, Taskmanager switches to that workspace first. For a comment or a reply, the task
   opens scrolled to that comment and highlighted for a moment, so you land on the reply itself.
4. **Mark all read** in the header clears the whole list at once. It only shows while something is unread.

If the board is no longer available to you, or the task is gone, you get a short message saying so instead of the
task.

## How else you hear

Click **Notification settings** (the button in the Inbox header) to open **How you hear**. Everything arrives in the
inbox; these are extra ways to be told:

- **Desktop notifications**: shown by your browser when Taskmanager is open in a tab you are not looking at. Your
  browser also has to allow notifications.
- **Push notifications on this device**: shown by your device even when Taskmanager is closed. This only appears when
  your browser supports it and the server has push set up. **Send a test** checks that it works.
- **Email**: a message for each notification, with a link to open it. If the server has no mail set up, the page says
  so and nothing is sent.

Push is per device: turn it on in each browser you want it in.

<!-- requires: staff -->
## Messages and replies

Staff also get items for project messages. A new message on a project goes to the whole team on it, and a reply goes
to the people already in that conversation. Clicking one opens the conversation over the inbox with the reply box
ready, and **All messages** in that panel shows the project's whole conversation list. Older notifications did not
keep which message they were about, so they open the list instead.

Messages are the team's own talk. A customer's contact is never told about them.

## Agent audit

If you have an AI agent that works on your boards with an API key, the Inbox gets a second tab, **Agent audit**. It
lists what your agents changed, each line marked "via API key" with the key's name. It never sends email or push, and
it has its own **Mark all read**. **Manage agents** opens [Settings](/help/workspace/settings), where the keys live. Reading a row is explained in
[The agent audit](/help/agents/agent-audit).
<!-- /requires -->
