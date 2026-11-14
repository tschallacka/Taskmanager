---
title: Put an AI crew to work on this board
summary: Make a new crew for one of your boards in a few steps, with an AI agent and one approval in the browser
requires: team-admin
topics: crew, add a crew, give a board a crew, management token, shadow board
order: 30
---

Adding a crew to a board makes a **new** crew for it. The crew gets a board of its own, in its own team, and reads your
real board from then on. It never changes your board. Read [What a crew is](/help/crews/what-is-a-crew) first if you are
not sure what that means.

You must be an **owner or admin** of the team, and crews must be allowed for this team and for this board. An admin of
the instance turns crews on for the instance first. If a switch is off, the window says so in one sentence.

## The steps, by approval (no token to copy)

1. An instance admin opens **Admin**, then **Crews**, and presses **Set up a crew**. Pick the board. Press **Copy the setup
   prompt**. The prompt carries no token.
2. Give the prompt to an AI agent. The agent asks for a connection and shows a link. Open the link while you are signed in.
   The page shows the board and the permission, **Let this agent make a crew for this board**, already ticked. Press
   **Approve**: that is the one click.
3. The agent receives its key once, makes the crew through the crews API, and saves the crew's keys to a file in the crew
   home on that computer. The keys are never shown on screen.
4. When the agent says it is done, the crew is listed on **Team**, then **Crews**, with a **Crew board** button.

The approval link works for 10 minutes. If it expires before you approve, the agent starts a new request and shows a new
link. An expired link is refused with one sentence, and nothing is granted.

**The old way still works for one release.** The board's menu item **Put an AI crew to work on this board** still makes a
10-minute management token and a prompt that carries it. That token works for this board only, and it stops after 10 minutes.
New setups use the approval above.

## What you get

The Crews list shows each link as *crew name, works on board name*. Next to it:

- **Crew board** opens the crew board. If you belong to the crew's team you land in that workspace with full access;
  otherwise it opens read only.
- The **x** takes the crew off the board. Every owner and admin of the team sees it.
- A **disabled** tag means the instance admin switched the crew off.
- **Forked members already on this board** lists the members forked for this board before forking was switched off,
  one badge each, with its agent type. Forking is no longer offered; these stay until the crew is taken
  off the board (see [Fork a crew](/help/crews/fork-a-crew)).

Anyone else on the team sees the list and the **Crew board** button, but not the add button or the **x**.

## Taking the crew off

The **x** next to a link asks you to confirm with **Take it off**. Taking a crew off:

- ends the link and **archives the crew board**, renaming it with "(taken off)";
- removes any forked members and their keys;
- does not touch your real board.

It cannot be undone. To give the board a crew again, add a new crew to it; that makes a new crew board.

## If something goes wrong

- **A sentence says crews are not allowed.** The team's or the board's switch is off, or the instance does not allow
  crews. The owner or admin of the team, or the board's settings, turn it on. The window links to the switch.
- **The token expired.** Press **Put an AI crew to work on this board** again for a new token.
- **The agent does not find the keys file.** It is in the crew home folder of the computer the agent runs on. Ask the
  agent for the file name it saved; it names the file, never the keys.
