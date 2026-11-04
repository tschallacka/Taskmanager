---
title: What an AI agent can do here
summary: What connecting an AI agent to Taskmanager gives you, what it can and cannot touch, and the two ways to have one
topics: agent, ai, mcp, claude code, api key, sprocket, automation
order: 10
---

An **AI agent** is a program that works for you: you ask it something in plain words, and it looks at your boards
or changes them. Taskmanager can be used by two kinds of agent.

- **Your own client**, such as Claude Code or Claude Desktop, running on your machine. You connect it once with an
  API key, and from then on it can use your boards from wherever you work. See
  [Connect Claude Code to your boards](/help/agents/connect-claude-code).
- **Sprocket**, the assistant built into Taskmanager. It opens from the round cog button at the bottom right of
  the app, and needs no connecting. See [Sprocket, the built-in assistant](/help/agents/sprocket).

## Why connect an agent

Someone who already works in a terminal or an editor does not want to switch to a browser to file a task.
With an agent connected you can say things like:

- "What boards do I have, and what is on the Verify column of the website board?"
- "Find every task that mentions the invoice export."
- "Create a task for the login bug I just fixed, and move the old one to Done."
- "Summarise what changed on this board and draft a message."

The agent does the looking, the typing and the moving. You decide what it may do, by the permissions you give its
key.

## How an agent talks to Taskmanager

Taskmanager has an **MCP server**. MCP (the Model Context Protocol) is the standard way AI programs plug into other
apps. The server offers the agent a set of **tools**, such as "read a board" or "create a task", and the agent
picks the ones it needs. The tools it is offered depend on the key it holds: see
[Tools an agent can use](/help/agents/tools-overview).

## An agent is you, and never more than you

A key belongs to a person, and everything the agent does it does as that person.

- It sees the same boards you see, and the same tasks on them. If something is hidden from you, it is hidden from
  the agent.
- If the app would refuse you something, it refuses the agent too.
- It never gets more than the permissions you gave the key. A key that can only read cannot change anything.

If you work with a customer's board as a contact of that customer, the agent sees only what is shared with
customers, and can file a task but not plan or change one. That is the same view you have yourself.

## What is recorded

Every change an agent makes through a key shows up in your **Inbox**, on the **Agent audit** tab, as if a colleague
had done it. See [The agent audit](/help/agents/agent-audit).

<!-- requires: staff -->
## What an agent can do for a team

As a member of a team, your agent can also work with the parts of a board that belong to the team: the board's
messages and status updates, logged time, custom fields, automation rules, linked GitHub items, and your own list
of tasks and inbox. Goals and portfolios are there too, for a key that is not limited to one board or customer.
The tools page lists them by feature.

A whole **crew** of agents can also work on a board of its own. See [What a crew is](/help/crews/what-is-a-crew).
<!-- /requires -->

## What an agent cannot do

- **Delete a board.** There is no tool for it. That stays with you, in the app.
- **Delete for good, almost never.** A deleted task or column goes to the board's trash for 7 days and can be
  restored. The exception is removing an update from a task's thread, which is gone at once.
<!-- requires: secrets -->
- **Bring a secret back.** If your key may change project secrets, a secret the agent deletes cannot be restored.
<!-- /requires -->
- **Reach beyond its key.** A key belongs to one workspace, and a key made for one board or one customer reaches
  only that.

## Where to go next

1. [Connect Claude Code to your boards](/help/agents/connect-claude-code) to try it in ten minutes.
2. [API keys](/help/agents/api-keys) to understand what you are handing out.
3. [Keep your agents safe](/help/agents/keep-agents-safe) before you give one write access.
