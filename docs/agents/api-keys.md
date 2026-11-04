---
title: API keys, permissions and reach
summary: What an API key is, the permissions it can carry, how expiry and reach work, and why a key never does more than its owner
topics: api key, permissions, scopes, expiry, reach, read-only, workspace, limit
order: 40
---

An **API key** is how an agent proves who it works for. It is a long secret that starts with `arn_`. Whoever holds the
key can do what the key allows, as the person it belongs to. Treat it like a password.

## What a key is tied to

- **One person.** The key belongs to whoever made it, and everything it does is done as that person.
- **One workspace.** A key made while you are in a team reaches that team's boards. A key made in your personal
  workspace reaches only your own. Switching teams in the app shows a different set of keys.
- **A set of permissions**, chosen when it is made and fixed afterwards.
- **An expiry**, or none.

Taskmanager stores only a scrambled copy of the key. That is why it is shown once, when you make it, and cannot be shown
again.

## A key can never do more than its owner

This is the most important rule. A key is the person acting through an agent:

- It reaches the same boards the person reaches, by the same rule as in the browser.
- It sees the same tasks and updates. Anything hidden from the person is hidden from the agent.
- It may change only what the person may change. Anything the app would refuse them is refused to the key.
- The permissions below can only take away from that, never add.

So giving a key every permission does not turn it into an administrator. If its owner leaves the team the key
belongs to, the key stops working at once.

## The permissions

When you make a key you choose from these. Each one decides which tools the agent is offered.

| Permission | In the key form | What it lets the agent do |
|---|---|---|
| `boards:read` | **Read boards** | Search and read boards, tasks and their updates, and read the help. |
| `boards:write` | **Write boards** | Create, edit and move things, post updates and messages, and move things to the trash. |

A key needs at least one permission. Both of these are ticked by default when you make a key. A key with only
`boards:read` is **read-only**: it is not even offered the tools that change things.

<!-- requires: secrets -->
Two more permissions are for project secrets. They are not ticked by default.

| Permission | In the key form | What it lets the agent do |
|---|---|---|
| `secrets:read` | **Read project secrets** | List the names of a project's secrets and get its `.env` text, values included. Every read is recorded in the project's trail. |
| `secrets:write` | **Write project secrets** | Add, change and delete a project's secrets by name, where you are a project manager. |

Only give an agent these when it really needs the values. A key with secrets read can read every secret you may read.
<!-- /requires -->

<!-- requires: crews -->
The instance admin can also hold a key with the `crews:manage` permission. It shows as a **crew api** badge in the list.
The key form never offers it, and no one but the instance admin may hold one.
<!-- /requires -->

## Expiry

When you make a key you choose **Never expires**, **30 days**, **90 days** or **1 year**. After that date the key stops
working and the agent is told "API key has expired". The list shows such a key as **expired**. An expired key cannot be
revived: make a new one.

Choose an expiry for any key you only need for a while.

## Reach: limiting a key to one customer or one board

By default a key reaches everything its person reaches in its workspace. A key can be limited to **one customer** or
**one board**. A limited key can open only those boards, and it is also not offered the tools that work across the whole
workspace: goals, portfolios, creating a board and the inbox.

You cannot choose this in your own keys under **Settings**. Limited keys are made by a team's owner or admin.

<!-- requires: team-admin -->
As an owner or admin you make them under **Team**, then **Keys**. See [Team keys for agents](/help/team/keys).
<!-- /requires -->

## Seeing and ending keys

**Settings**, **API keys & MCP**, **Active keys** lists your keys for the workspace you are in: the name, its permissions
as badges, the start of the key (such as `arn_a1b2c3...`), when it was made, when it was last used and when it expires. You can end
one at any time. See [Create and revoke a key](/help/agents/create-and-revoke-a-key).

## Next

Your other settings are described in [Settings](/help/workspace/settings).
[Keep your agents safe](/help/agents/keep-agents-safe) lists what to decide before you give an agent write access.
