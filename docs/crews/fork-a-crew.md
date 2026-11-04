---
title: Fork a crew for a board
summary: Give each crew member its own account and key for one board, and hand the keys to whoever runs the crew
requires: team-admin
topics: fork, crew, agents, keys, accounts, init, agent type
order: 40
---

A crew works the same way on every board it is given: one planner, four workers, a tester and a reviewer for all of
them. When it works on **several boards**, you often want agents that belong to one board each, so you can tell which
agent worked on which board and so one agent's key reaches only its own board. That is a **fork**.

A fork makes seven agents from the crew's working members, each named for the board and the person, for example
`internal-tools-wren`:

- the planner,
- the four workers,
- the usability tester,
- the code reviewer.

**Boss** (who runs the crew) stays one for the whole crew, and the customer logins belong to the product, so neither
is forked.

Every fork is its own account in the crew's team, with a **key limited to exactly that one crew board**. It reaches
nothing else.

## Fork a crew

You can fork a crew you made yourself, once a board has it.

1. Open **Team**, then **Crews**.
2. Under the link, press **Fork the crew for this board**. (The **Step by step** form offers it too, as step two.)
3. A box lists the seven forks with their keys. **They are shown once.** Press **Download** and keep the file
   `forks-<crew>-<board>.json`; it also holds each account's password, so keep it as private as a password.

The link then lists the forked agents by name.

## Hand the keys over

On the computer that runs the crew, give the file to the crew kit:

```
CREW_HOME=~/crew-home/<crew> node <kit folder>/init.mjs --forks ~/Downloads/forks-<crew>-<board>.json
```

It stores the file where only you can read it and writes one agent type per fork. Start Boss's Claude Code session
after that (or send an open one a new message): Claude Code reads the new agent types then. Each fork does the role
of the member it was made from and signs in as its own name:

```
CREW_HOME=~/crew-home/<crew> node <kit folder>/crew.mjs internal-tools-wren mcp list_boards '{}'
```

## New keys

**New keys** on the link makes new passwords and keys for the forks, and the old ones stop working **at once**. It
asks you to confirm first (**Make new keys**), then shows the new keys once, as a fork does. Do this when a key was
lost or leaked. Hand the new file over the same way: running `init.mjs --forks` again replaces the old file.

## Remove the forks

**Remove the forks** asks you to confirm (**Remove**), then deletes the seven accounts and their keys. The crew stays on the board. Their agent
definitions and the file on the crew's computer are then yours to delete. Taking the crew off the board removes
the forks too.

## Good to know

- A fork **cannot be widened**. The crew's own "rotate" (new keys for the whole crew) leaves forks alone, because
  it would hand out keys that reach the whole crew team and undo the limit.
- When the instance admin disables the crew, the forks are cut off with the rest: their keys are revoked and stay
  revoked after the crew is enabled again. While the crew is disabled you cannot fork it or make new keys; once it
  is enabled, **New keys** brings the forks back.
- A fork reads the real board the same way the crew does, through the crew board it is limited to, and never
  writes to it.
- Only the person who made the crew can fork it. A fork is a copy of the working members; once forked, **Fork the
  crew for this board** turns into **New keys** and **Remove the forks**.
