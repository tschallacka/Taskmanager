---
title: Connect Claude Code to your boards
summary: A start-to-finish walk-through, from making a key to watching Claude Code create a task and finding it in the audit
topics: claude code, tutorial, mcp, api key, connect, setup, terminal
order: 20
---

In this tutorial you make an API key, connect Claude Code to Taskmanager, ask it about your boards, let it create a
task, and then check what it did. It takes about ten minutes. You need Claude Code installed on your computer.

## 1. Make a key

1. Open **Settings** (from the account menu in the sidebar) and find the panel **API keys & MCP**.
2. Under **New key**, give it a name you will recognise, such as *Claude Code on my laptop*.
3. Leave **Read boards** and **Write boards** ticked. The write permission is what lets the agent create a task
   later in this tutorial. For a first try that is fine; afterwards, see [Keep your agents safe](/help/agents/keep-agents-safe).
4. Pick an expiry in the dropdown: **Never expires**, **30 days**, **90 days** or **1 year**. For a try-out, choose
   **30 days**.
5. Press **Create key**.

A box titled **Copy your key now** appears. The key starts with `arn_` and is shown **once**: Taskmanager keeps only
a scrambled copy and cannot show it again. If you lose it, you make a new one.

## 2. Connect Claude Code

In the same box, press **Copy command**. It copies two lines, which look like this (with your own address and key):

```
export TASKMANAGER_API_KEY=arn_...
claude mcp add --scope user --transport http taskmanager https://your-taskmanager/api/mcp \
  --header 'Authorization: Bearer ${TASKMANAGER_API_KEY}'
```

Paste both lines into a terminal and run them. This is what they do:

- The first line puts the key in an environment variable called `TASKMANAGER_API_KEY`, for this terminal only.
- The second line adds an MCP server called `taskmanager` to Claude Code. `--scope user` means every project you open
  in Claude Code can use it. The address ends in `/api/mcp`, which is where Taskmanager speaks MCP.
- The key itself is **not** saved in Claude Code's settings. Only the name of the variable is. Claude Code reads the
  variable every time it starts.

Because of that last point, put the `export` line in your shell profile (for example `~/.zshrc`), or run it in each
terminal before you start `claude`. If the variable is missing, Claude Code cannot sign in.

## 3. Check that it connected

1. Start Claude Code with `claude`.
2. Type `/mcp`. You should see `taskmanager` in the list, connected.

If it is not connected, see "When it does not work" below.

## 4. Ask about your boards

Type a question in plain words:

> What boards do I have?

Claude Code uses the tool `list_boards` and answers from what comes back. Try a second one:

> Show me what is on the board called "Website", column by column.

It reads the board with `get_board`. It only ever sees what you can see.

## 5. Let it create a task

Name a board and a column that exist. A new board starts with **Backlog**, **To do**, **Verify** and **Done**.

> Create a task "Try the agent" in To do on the Website board, with the description "Made by Claude Code".

Open the board in Taskmanager: the task is there. This worked because the key has **Write boards**. With a
read-only key Claude Code would tell you it cannot do it.

## 6. See what it did

1. Open the **Inbox**.
2. Choose the **Agent audit** tab. It appears as soon as you have a key.

You will find a row such as *Created the task "Try the agent"*, with the key's name, the board and the time. Press the
row to go to the task. See [The agent audit](/help/agents/agent-audit).

## 7. Optional: teach it the habits

Claude Code works better with a short guide to Taskmanager. See
[The Taskmanager skill](/help/agents/taskmanager-skill).

## 8. When you are done

If this was only a try-out, remove the key: in **Settings**, under **Active keys**, press the trash icon beside it.
Claude Code is disconnected immediately. See [Create and revoke a key](/help/agents/create-and-revoke-a-key).

## When it does not work

- **`/mcp` shows taskmanager as failed, or it reports that it cannot sign in (Taskmanager answers 401).** The variable is probably not set in the terminal where you
  started `claude`. Run the `export` line again, then start `claude` again. A 401 can also mean the key expired or was
  revoked.
- **You are tempted to paste the key straight into the second line.** Use the version with `${TASKMANAGER_API_KEY}`
  instead: it keeps the key out of Claude Code's saved settings.
- **Claude Code says it cannot create or change anything.** The key is read-only. Make a new key with **Write boards**.
- **You want to test the connection without Claude Code.** See [Connect another MCP client](/help/agents/connect-other-clients),
  which has a command that lists the tools using the key.
