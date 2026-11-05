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

Because of that last point, the variable has to be set wherever Claude Code starts. Set it once, in the shell profile:

1. Open the profile in an editor, not in the terminal, so the key does not end up in your shell history. On a Mac with
   zsh that is `~/.zshrc`; on Linux with bash it is `~/.bashrc`.
2. Add the `export` line from the box, with your key in it, and save the file.
3. Open a new terminal and check that the variable holds the key. Print only its first four characters:

   ```
   echo ${TASKMANAGER_API_KEY:0:4}
   ```

   It prints `arn_`. If it prints nothing, the profile was not read: check the file name and save it again.

4. Only then start `claude` from that terminal.

If you start Claude Code from an app rather than a terminal, and that app sets its own environment, the profile is not
read there. Add `TASKMANAGER_API_KEY` to that app's environment settings instead. Without the variable, Claude Code
cannot sign in.

### Replace a key that is already connected

If `claude mcp add` answers `MCP server taskmanager already exists in user config`, a connection is already there, and
adding it again changes nothing. Replace it instead. In the box where you copied the first command, press **Copy update
command**. **Settings**, **Sprocket** shows the same command under **MCP server**. It has three lines:

```
export TASKMANAGER_API_KEY=arn_...
claude mcp remove --scope user taskmanager 2>/dev/null
claude mcp add --scope user --transport http taskmanager https://your-taskmanager/api/mcp \
  --header 'Authorization: Bearer ${TASKMANAGER_API_KEY}'
```

The second line removes the old connection. If there is none yet, the remove fails quietly and the third line still adds
the server, so the same command also works for a first connection.

After you paste it:

- Put the new key in the shell profile in place of the old one, as above, so the variable holds the new key wherever
  Claude Code starts.
- Restart Claude Code from a terminal that has the new key. A Claude Code session that is already running keeps the key
  it started with.

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

- **`/mcp` shows taskmanager as failed, and the answer is 401 "Invalid or missing API key".** Taskmanager received no key,
  or a key it does not know. Usually the variable is not set where Claude Code started. Open a new terminal, run
  `echo ${TASKMANAGER_API_KEY:0:4}` and check that it prints `arn_`. If it prints nothing, add the `export` line to the
  shell profile as described above and start `claude` again. A 401 can also mean the key expired or was revoked. Make a
  new key and replace the old one, as described above.
- **`claude mcp add` answers `MCP server taskmanager already exists in user config`.** A connection is already there, so
  nothing changes. Use the update command under **Replace a key that is already connected**, which removes the old one
  first.
- **You are tempted to paste the key straight into the second line.** Use the version with `${TASKMANAGER_API_KEY}`
  instead: it keeps the key out of Claude Code's saved settings.
- **Claude Code says it cannot create or change anything.** The key is read-only. Make a new key with **Write boards**.
- **You want to test the connection without Claude Code.** See [Connect another MCP client](/help/agents/connect-other-clients),
  which has a command that lists the tools using the key.
