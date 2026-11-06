---
title: Give a board a crew
summary: Link one of your boards to a crew you made, step by step, and take it off again
requires: team-admin
topics: crew, give a board a crew, attach, link, wizard, shadow board
order: 30
---

Giving a board a crew links one of your team's boards to a crew. The crew gets a board of its own for it, in the
crew's team, and can read your real board from then on. Read [What a crew is](/help/crews/what-is-a-crew) first if
you are not sure what that means.

You must be an **owner or admin** of the team, and you can give only a **crew you made yourself**. Only the instance
admin makes crews (on the Crews page in Settings), so in practice the person who gives a board a crew is an instance
admin who is also an owner or admin of this team. If you see "You have not made a crew", you have none to give.

## With the guided steps

1. Open **Team** in the workspace menu, then **Crews**. (Or open a board's menu in the sidebar and choose
   **Give it a crew**, which opens the same steps with that board already picked.)
2. Press **Step by step**.
3. **Board and crew.** Pick the crew and the board, then **Give the board a crew**. This makes the crew board and the
   link. If the crew already works on that board, the button says **Continue** instead.
4. **Fork the members.** Choose whether the crew's members work for the whole crew, or get agents of their own for
   this board. See [Fork a crew for a board](/help/crews/fork-a-crew). If the crew works on this one board, press
   **Skip: the crew works as one**. If the members are already forked for this board, this step offers **Make new
   keys** instead, which replaces the old keys at once.
5. **Hand over the keys** (only when the members are forked). The steps show what to give whoever runs the crew.
6. **Check it.** The last step shows what to expect and has an **Open the crew board** link.

## Without them

On **Team**, then **Crews**, the **Give a board a crew** form does the first step in one go: pick a crew, pick a
board, press **Give it a crew**.

## What you get

The Crews list shows each link as *crew name, works on board name*. Next to it:

- **Crew board** opens the crew board. If you belong to the crew's team you land in that workspace with full access;
  otherwise it opens read only.
- The **x** takes the crew off the board. Every owner and admin of the team sees it, not only the person who made
  the crew.
- A **disabled** tag means the instance admin switched the crew off. It cannot be forked or given new keys until it
  is enabled again.

Anyone else on the team sees the list and the **Crew board** button, but not the form, **Step by step**, the **x** or
the fork buttons.

## Taking the crew off

The **x** next to a link asks you to confirm with **Take it off**. Taking a crew off:

- ends the link and **archives the crew board**, renaming it with "(taken off)";
- removes any forked members and their keys;
- does not touch your real board.

It cannot be undone, but you can give the board a crew again; that makes a new crew board.

## If something goes wrong

- **"You have not made a crew."** Only a crew you made yourself can be given, and only the instance admin makes
  crews. If someone else made it, ask them to give the board the crew.
- **The crew is already on this board.** Each crew can be linked to a board once. Use **Continue** to carry on with
  it.
- **Not every board can take the crew.** A crew's own work board, and the crew board it keeps, cannot be given that crew: it would work on itself. Every other board of your team can, including one in the crew's own team.
- **No Step by step button.** It needs at least one crew you made, and the owner or admin role.
