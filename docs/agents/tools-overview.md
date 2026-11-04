---
title: Tools an agent can use
summary: The tools Taskmanager offers an agent, grouped by feature, and which ones a key is given
topics: tools, mcp, tool list, boards, tasks, features, permissions, read-only
order: 60
---

An agent works through **tools**: small named actions such as `get_board` or `create_task`. The agent's program asks
Taskmanager which tools it has, and the answer depends on the key. This page groups them by what they are for. The
full description of every tool, with its parameters, is sent to the agent itself, so the agent always has the exact
details for this server.

## Which tools a key is offered

- A key is offered only the tools its **permissions** cover. A read-only key sees only the reading tools.
- A key **limited to one board or one customer** is not offered the tools that work across the whole workspace:
  creating a board, goals, portfolios and the inbox.
- Even a tool the key is offered refuses what its owner may not do. The tools follow the same rules as the app.
- If an agent calls a tool the key may not use, it gets a plain sentence saying why, and can tell you.

[API keys, permissions and reach](/help/agents/api-keys) explains the permissions.

## Boards, columns and tasks

The core of it. Most agents need nothing else.

- **Read:** list the boards (`list_boards`), read a board as it is drawn (`get_board`), read one task in full
  (`get_task`), search tasks across boards (`search_tasks`) and list the labels in use (`list_task_labels`).
  A board comes back as cards: title, labels and the opening of the description. The full text is in `get_task`.
  An agent can also be given a link to a board or a task instead of a name.
<!-- requires: write -->
- **Change:** create and rename boards (`create_board`, `update_board`), add, rename, recolour and move columns,
  create, edit, move and reorder tasks (`create_task`, `update_task`, `move_task`), and move tasks and columns to the
  trash and back (`delete_task`, `restore_task`, `delete_column`, `restore_column`). Moving a task to a Done column
  files it there. The done mark is separate: `update_task` sets it. `create_task` can also make a subtask under a
  card, for the team only.
<!-- /requires -->

## Task updates

A task has a thread of short updates.

- Reading the thread is part of `get_task`.
<!-- requires: write -->
- `post_task_update` adds one, and tells the people on the task in their Inbox. `edit_task_update` and
  `delete_task_update` change or remove one. An agent may change or remove updates that an agent posted for you. Updates
  typed in the app stay in the app, unless you own the board or are a team owner or admin, who may change any update on
  their boards. Removing an update is permanent and has no trash.
<!-- /requires -->

## Help

`search_help` and `read_help` let an agent read these help pages, cut to what the key's person may do. See
[Sprocket, the built-in assistant](/help/agents/sprocket) for how Sprocket uses them.

<!-- requires: staff -->
## For people who work in a team

- **Messages:** `list_messages` reads a board's conversations; `post_message` writes or replies.
- **Status updates:** `list_status_updates` reads a board's history; `post_status_update` sets the board's health
  (on track, at risk, off track) and records what you wrote.
- **Time:** `list_time` reads logged time; `log_time` logs time on a task, as you.
- **Custom fields:** `list_fields` shows a board's fields; `create_field` adds one. Fields can be set when creating or
  updating a task.
- **My tasks and inbox:** `my_tasks` is your assigned tasks across boards; `list_notifications` and
  `mark_notifications_read` are your inbox.
- **Goals and portfolios:** `list_goals`, `create_goal`, `update_goal`, `list_portfolios`, `create_portfolio` and
  `update_portfolio`. Not offered to a key limited to one board or customer.
- **Rules:** `list_rules`, `create_rule`, `update_rule` and `list_rule_runs` let an agent read and build a board's
  automation. A refused rule comes back with sentences saying what to fix.
- **GitHub on a task:** `link_github`, `unlink_github` and `get_task_github` link and read GitHub issues, pull
  requests, branches and runs on a task.
- **GitHub deliveries:** `list_failed_deliveries`, `get_failed_delivery` and `github_queue_status` show GitHub changes
  that Taskmanager could not apply. Retrying or discarding one is for a crew's project manager key only.

The tools in this list that change something need the write permission.
<!-- /requires -->

<!-- requires: secrets -->
## Project secrets

- `list_project_secrets` gives the names, never the values.
- `get_project_env` gives the `.env` text for the secrets you may read. The server cannot write a file on the agent's
  machine, so the agent writes that text itself. Make sure the `.env` is ignored by git.
- `set_project_secrets` adds or changes secrets, and `delete_project_secret` removes one. Only a project's managers may
  change secrets, and a deleted secret cannot be restored.

Reading the `.env` is recorded in the project's trail and in the [agent audit](/help/agents/agent-audit). The agent
should never put a value into a task, a message or a chat.
<!-- /requires -->

## What no tool can do

- There is no tool that deletes a board. Deleting a board takes its tasks with it, so that stays with you, in the app.
- Tasks and columns are never removed for good: they go to the board's trash, which empties after 7 days.
- A tool cannot do what the app would refuse you, however it is asked.
