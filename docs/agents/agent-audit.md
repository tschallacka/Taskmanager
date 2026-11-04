---
title: The agent audit
summary: Where to read what your agents changed, what a row says and what is not recorded
topics: audit, agent audit, inbox, activity, log, history, what did the agent do
order: 70
---

The **agent audit** is the record of what your agents did. Every time an agent changes something through one of your
API keys, a row is added, so you can read it afterwards the way you would read what a colleague did.

## Where to find it

1. Open the **Inbox** (see [Inbox](/help/workspace/inbox) for the rest of it).
2. Choose the **Agent audit** tab next to **Inbox**.

The tab shows only when you have at least one API key, or when rows from a key you have since deleted are still kept. A
number on the tab counts the rows you have not read. Agent activity never sends an email or a push message, and it does
not count in the sidebar's inbox badge: it is a record to read, not an alarm.

## What a row says

Each row has:

- a one-line summary, such as *Created the task "Fix login"*, *Moved to Done*, *Posted an update: "Deployed to
  staging"* or *Deleted the column "Old ideas" (in the trash for 7 days)*;
- the **name of the key** that did it, which is why each agent should have its own key with a clear name;
- the board and the task it concerned, when there is one;
- the time.

Press a row to go to its task, or to its board when the change was about the board. If the task has since been moved to
the trash, the row keeps the task's title but no longer links to it.

Use the **All** and **Unread** filters at the top, press a row to mark it read, or press **Mark all read**.

## What is recorded

- **Every change an agent made that succeeded**: creating, editing, moving and trashing boards, columns and tasks,
  and updates it posted on tasks.
<!-- requires: staff -->
  For people who work in a team this also covers messages and status updates it posted, time it logged, rules, fields
  and GitHub links it added, goals and portfolios it made or changed, and notifications it marked read. Reading a
  failed GitHub delivery is recorded too.
<!-- /requires -->
<!-- requires: secrets -->
  Reading a project's `.env` is recorded as well: the row says how many variables, never their values.
<!-- /requires -->
- **Only your own keys.** The rows are the ones for the keys you made, and only you see them.

## What is not recorded

- **Ordinary reads.** Listing boards, reading a task or searching are not logged.
- **Attempts that failed.** A change the server refused is not in the audit, because nothing changed.
- **The words of an edited or removed update.** A row about one gives its id and length, not the text.
- **Changes you made yourself** in the app. They show where they always do.

Recording is a best effort: it never slows an agent down or makes its call fail. If the record itself cannot be
written, the agent's change still went through and nothing tells you.

## How long rows are kept

Rows are removed once they are older than **90 days**.

## Sprocket and the audit

When Sprocket answers through Claude Code, it works through one of your keys, so what it changes is recorded under that
key's name like any other agent. When Sprocket answers through OpenRouter it makes its changes in your browser, as you,
and they are not agent audit rows. See [Sprocket, the built-in assistant](/help/agents/sprocket).

## Use it

- Look at the tab after you give an agent write access for the first time.
- If a row surprises you, revoke the key. See [Create and revoke a key](/help/agents/create-and-revoke-a-key).
- Most changes can be undone by hand: a trashed task or column is restored from **Show trashed** on its board within 7
  days.
