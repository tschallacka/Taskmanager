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
- **What it reaches.** The boards the key may open. You choose them when you make the key and change them later, without a new secret. See **Reach** below.
- **A set of permissions.** You choose them when you make the key, and you can change them later.
- **An expiry**, or none. You set it when you make the key.

Taskmanager stores only a scrambled copy of the key. That is why it is shown once, when you make it, and cannot be shown
again.

## A key can never do more than its owner

This is the most important rule. A key is the person acting through an agent:

- It reaches only boards the person can open, by the same rule as in the browser.
- It sees the same tasks and updates. Anything hidden from the person is hidden from the agent.
- It may change only what the person may change. Anything the app would refuse them is refused to the key.
- The permissions below can only take away from that, never add.
- It acts with its owner's own access: the same boards and the same audience. On a board of a workspace the owner is a
  member of, the key is **staff**, as the owner is. On a board the owner reaches only as a customer or a guest, the key
  sees what a customer sees: only the tasks marked for customers.

So giving a key every permission does not turn it into an administrator. If its owner leaves a workspace, the key loses
that workspace's boards at once.

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

## Reach: which boards a key can open

When you make a key, you choose what it reaches. You can change this later on the key, and the secret stays the same.

- **Select all** reaches every board you can open, in every workspace you are in, and the boards you get later.
- **A workspace** reaches every board of that workspace, now and later. Your own personal workspace is listed as **Personal**.
- **Single boards** reach only the boards you tick.

Whatever you pick, a key reaches a board only while its owner can open it. If you leave a workspace or lose access to a
board, the key loses it at once. Select all and a whole workspace also cover boards added later, without any change to
the key.

A key that reaches more than one workspace needs a workspace named when an agent creates a board (`create_board`). A key
that reaches one workspace puts a new board there without asking.

**Team keys** are different. An owner or admin of a team makes them under **Team**, then **Keys**. A team key reaches the
whole team, one customer's boards, or one board. A key limited to one customer or one board is not offered the tools that
work across the whole workspace: goals, portfolios, creating a board and the inbox. Team keys show in your own key list
too, read-only and labelled as team keys.

<!-- requires: team-admin -->
As an owner or admin you make them under **Team**, then **Keys**. See [Team keys for agents](/help/team/keys).
<!-- /requires -->

## Seeing and changing keys

**Settings**, **API keys & MCP**, **Active keys** lists all your keys, across every workspace you are in. Each row shows the
name, the permissions as badges, the start of the key (such as `arn_a1b2c3...`), where the key reaches, when it was made,
when it was last used and when it expires.

Choose a row to see its permissions and its reach. Change them there and press **Save**. The key itself does not change,
so the agent keeps working without a new secret. You can end a key at any time with **Delete key**. See
[Create and revoke a key](/help/agents/create-and-revoke-a-key). To replace the key of a connection that Claude Code
already has, see [Connect Claude Code](/help/agents/connect-claude-code), under **Replace a key that is already connected**.

## Next

Your other settings are described in [Settings](/help/workspace/settings).
[Keep your agents safe](/help/agents/keep-agents-safe) lists what to decide before you give an agent write access.