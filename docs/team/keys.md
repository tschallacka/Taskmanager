---
title: Team keys for agents
summary: Make a key that lets an AI agent work in your team, limited to the whole team, one customer or one board
requires: team-admin
topics: keys, api key, team key, agent, reach, limit, mcp
order: 50
---

A **team key** lets an AI agent (Claude Code or any other MCP client) work in your team. As an owner or admin you
make them under **Team**, then **Keys**. A team key works only in this team, and every owner and admin of the team
sees it in the list and can revoke it. It belongs to the person who made it.

## Reach: how much the key can touch

When you make a key you choose what it **Reaches**:

| Reach | What the agent can open |
|---|---|
| **The whole team** | Every board of the team. |
| **One customer** | Only the boards of that customer. |
| **One board** | Only that one board. |

A key limited to one customer or one board is also **not given the tools that work across the whole team**: goals,
portfolios, creating a board, and the inbox. It cannot see or start anything beyond its reach, even by asking.

## Making a key

1. Open **Team**, then **Keys**.
2. Give the key a name that says who it is for, for example *Wren on Fundesign*.
3. Pick **Reaches**: the whole team, one customer (and which) or one board (and which). Only boards the team works
   on itself are offered.
4. Choose when it **Expires**.
5. **May change things (create, edit and move tasks), not only read** is ticked to start with. Untick it for an
   agent that should only read.
6. Click **Create key**, then **copy the key now**. It is shown once and cannot be shown again.

## What the key can do

A key never does more than the person it belongs to, and never more than its permissions allow. It reads and
writes only what its reach covers. When the person it belongs to leaves the team, the key stops working.

The list under **Keys** shows every key of the team, who owns it, what it reaches and when it was last used. An
owner or admin can **revoke** any of them there; revoking is immediate and cannot be undone, so make a new key
instead.

## Good to know

- Make a key per agent, not one for everyone, so the list tells you who used what and you can revoke one without
  breaking the others.
- Prefer the smallest reach that lets the agent do its job: one board for an agent that works on one board.
- If you lose a key, make a new one and revoke the old.
