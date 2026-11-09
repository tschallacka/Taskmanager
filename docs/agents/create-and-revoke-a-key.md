---
title: Create and revoke a key
summary: Step by step, make an API key for an agent, copy it safely, replace it and end it
topics: api key, create, revoke, rotate, expiry, lost key, delete key
order: 50
---

You make and end your own keys under **Settings**, in the panel **API keys & MCP**. Read
[API keys, permissions and reach](/help/agents/api-keys) first if you are not sure what the permissions mean.

## Make a key

1. Open **Settings**. Check which workspace you are in: a key belongs to the workspace you are in when you make it. The
   panel says "these belong to" followed by the workspace name.
2. Under **New key**, type a name that says who or what will use it: *Claude Code on my laptop*, *Release script*.
   The names are what you will see in the list and in the agent audit, so make them distinct. The name can be 60
   characters at most.
3. Tick the permissions the agent needs, and no more. **Read boards** and **Write boards** are ticked to start with.
   Untick **Write boards** for an agent that only needs to look.
<!-- requires: secrets -->
   The two project-secret permissions are off by default. Tick them only for an agent that must read or change secrets.
<!-- /requires -->
4. Choose the expiry in the dropdown: **Never expires**, **30 days**, **90 days** or **1 year**.
5. Press **Create key**. The button stays off until the key has a name and at least one permission.

## Copy it now

A box titled **Copy your key now** appears with the whole key in it. This is the only time it is shown.

- Press **Copy** to copy the key.
- Press **Copy command** to copy two lines that connect Claude Code with the key in place: one that puts the key in
  `TASKMANAGER_API_KEY`, and one that adds the MCP server. See
  [Connect Claude Code to your boards](/help/agents/connect-claude-code).
- Press the X to dismiss the box. Once dismissed, the key cannot be brought back.

Store the key where the agent reads it from, such as an environment variable or a password manager. Never paste it into
a task, a message, a chat or a repository.

## If you lose a key

There is no way to see it again. Make a new key, put it where the agent reads it, then revoke the old one (below).
You can also give a key a new secret: see [Regenerate a key's secret](#regenerate-a-keys-secret).

## Regenerate a key's secret

1. Under **Active keys**, open the key and press **Regenerate key**, then **Regenerate** in the box that names it.
2. The old secret stops working at once. The name, the permissions and the boards stay.
3. The new secret is shown once, with the setup command that puts it in place. Copy it now.

**Show prompt** on an open key shows the same setup command without a secret, with a placeholder. Regenerate the key to
get a secret to paste.

## Read the list

Under **Active keys** each key shows:

- its name and its permissions as badges (such as *boards read*, *boards write*);
- the first characters of the key (`arn_` plus six more) so you can tell keys apart;
- when it was made;
- when it was **last used**, or *never used*;
- when it expires, or *never expires*, or *expired*.

*Last used* is a good way to find a key nothing uses any more. It is updated at most about once a minute, so it
can lag a little.

## Revoke a key

1. Under **Active keys**, open the key and press **Delete key**.
2. The box names the key, its first characters and when it was last used. Press **Delete key** in the box to confirm.
3. The key is deleted at once. Anything still using it stops working on its next request, and gets "Invalid or
   missing API key".

Revoking cannot be undone. If you revoked the wrong key, make a new one and give it to the agent.

An expired key is not removed by itself. It stays in the list as *expired* until you revoke it, and it no longer works.

## Replace a key without a gap

1. Make a new key with the same permissions and a new name.
2. Put it where the agent reads its key, and check the agent still works.
3. Revoke the old key.

<!-- requires: team-admin -->
## Team keys

Keys limited to one board or one customer, and keys for a whole team's agents, are made by a team's owner or admin under
**Team**, then **Keys**. They are ended there too. See [Team keys for agents](/help/team/keys).
<!-- /requires -->

## Good habits

- One key per agent or machine, so revoking one leaves the others working.
- Give a key an expiry unless you have a reason not to.
- Revoke a key the moment you stop using it.
- If a key might have leaked, revoke it first and ask questions later.
