---
title: Connect another MCP client
summary: Point Claude Desktop or any other MCP client at Taskmanager, test the key from a terminal and read the error messages
topics: mcp, claude desktop, endpoint, bearer, curl, client, connect, 401, test
order: 30
---

Any program that speaks MCP over HTTP can use Taskmanager, not only Claude Code. This page gives what such a client
needs and how to test it. For Claude Code, the
[tutorial](/help/agents/connect-claude-code) is quicker.

## What a client needs

You need two things.

1. **The endpoint.** Your Taskmanager address followed by `/api/mcp`, for example `https://tasks.example.com/api/mcp`.
   The page **Connect an AI agent** (Settings, then **Setup guide** in the **API keys & MCP** panel) shows it filled in
   for this server, with a copy button.
2. **A key**, sent as a header on every request: `Authorization: Bearer arn_...`. Make one under
   [Create and revoke a key](/help/agents/create-and-revoke-a-key).

The transport is streamable HTTP. There is no session to keep alive: every request carries the key and is checked on
its own, so a client can reconnect at any time.

## A configuration file

Claude Desktop and many other clients take a block like this. The **Setup guide** page fills in the address:

```
{
  "mcpServers": {
    "taskmanager": {
      "type": "http",
      "url": "https://your-taskmanager/api/mcp",
      "headers": { "Authorization": "Bearer <your key>" }
    }
  }
}
```

Names for the same settings differ between clients, so check your client's own manual for where the file lives and
what it calls `type` and `headers`. Here the key sits in the file in plain text. Keep that file private, and do not
commit it to a repository. If your client can read the key from an environment variable instead, prefer that. Which
clients can do so is not covered here: look it up in your client's manual.

## Test the key from a terminal

This asks the server for its list of tools:

```
curl -X POST https://your-taskmanager/api/mcp \
  -H "Authorization: Bearer $TASKMANAGER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A list of tools means the key works. The list is already cut to the key: a read-only key does not list the tools that
change things.

## What the errors mean

| You see | It means |
|---|---|
| 401 "Invalid or missing API key" | The header is missing or wrong, or the key was revoked. If the client takes the key from `$TASKMANAGER_API_KEY`, the variable must be set in the environment the client starts from. [Connect Claude Code](/help/agents/connect-claude-code) explains where that is. |
| 401 "API key has expired" | The key's expiry date has passed. Make a new key. |
| 403 "API key owner is no longer a member of this team" | The key belongs to a team and its owner has left it. The key stops working with the membership. |
| 403 "This API key carries no permissions" | The key was made with no usable permissions. Make a new one. |
| A tool answers that the key "does not carry" a permission | The tool needs a permission the key lacks, such as `boards:write` to change anything. |
| A tool answers that the key is limited to one board or customer | The tool works across the whole workspace, so a limited key may not use it. |

A tool failure is returned as text the agent can read, so a well-behaved agent tells you what it could not do and why.

## Keep in mind

- The key is the person. Whatever the client does, it does as the key's owner, in the key's workspace.
- Give each client its own key, so you can revoke one without disconnecting the others.
- The Taskmanager server and the agent can be on different machines. Only the agent you connect yourself receives
  your data.
