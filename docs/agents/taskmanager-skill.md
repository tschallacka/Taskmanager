---
title: The Taskmanager skill
summary: Download a short guide that teaches Claude Code to use your boards well, and where to save it
topics: skill, skill.md, claude code, instructions, guide, habits, download
order: 80
---

The tools alone are enough for an agent to work with your boards. A **skill** makes it work with them *well*. It is
a short Markdown file, called `SKILL.md`, that Claude Code reads and follows. It says how Taskmanager is built, what
the agent should do before it writes, and how to avoid common mistakes.

## What is in it

The skill is made by your Taskmanager server from the tools it really offers, so it describes your server and not a
generic one, and a tool added in an update is in the next copy. It covers:

- **Connecting.** The address of your MCP endpoint, the key header and what each permission lets the agent do.
- **Acting as you.** The agent sees what you see and may do what you may do, and when a tool refuses, it tells you
  instead of searching for another route.
- **How to work.** Read before writing; say what will change and change only that; send the whole text when
  replacing a description; how to clear a date, an assignee or a field; how to write dates and durations; be brief in
  what is posted.
- **Reading a long task thread.** How to read the newest updates first, how to catch up from the last update it saw,
  and how to find updates that start with some words.
- **The tools,** grouped by feature, each with a one-line description and whether it reads or writes. It includes
  short notes, such as how a task can wait for another task, and how deleting works.

## Get it

1. Open **Settings**, to the panel **API keys & MCP**.
2. Press **Agent skill**. Your browser downloads `SKILL.md`.

You can also open **Settings**, then **Sprocket**, and under **Connect an agent** press **Copy SKILL.md** in the
**Taskmanager skill** block.

The page **Connect an AI agent** (the **Setup guide** button) also shows a skill text. Prefer the downloaded one: it is
made from the tools as they are now, while that text is written by hand and can lag behind.

## Where to save it

Claude Code looks for skills in a folder per skill.

- For every project on your machine: `~/.claude/skills/taskmanager/SKILL.md`
- For one project only: `.claude/skills/taskmanager/SKILL.md` inside that project

On a Mac, after pressing **Copy SKILL.md**, you can write the file in one go:

```
mkdir -p ~/.claude/skills/taskmanager && pbpaste > ~/.claude/skills/taskmanager/SKILL.md
```

Start a new Claude Code session afterwards so it picks the skill up. The skill is plain text: you can open it and read
what you are handing your agent.

## Keep it up to date

Download it again after Taskmanager is updated, and save it over the old file. Nothing updates it by itself.

## What it does not do

- **It does not connect anything.** You still need a key and the MCP server. See
  [Connect Claude Code to your boards](/help/agents/connect-claude-code).
- **It does not widen access.** The key decides what the agent may do. A skill that describes a tool the key is not
  offered does nothing for it.
- **It does not hold a key.** Never write your key into the skill file.

## Next

[Tools an agent can use](/help/agents/tools-overview) is the same list in plainer words, with the permissions each
group needs.
