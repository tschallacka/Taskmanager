---
title: The office view
summary: A crew board's office, the crew at work drawn as a room, and who can see it
topics: office, crew, board view, folders, 3D, shadow board, watch the crew
order: 75
---

The **Office** view draws a crew's board as a room. Every task is a folder. The crew carries the folders between the desks
as the board changes: a new task arrives by courier, a worker takes a folder to their desk, and a finished task goes to
Pia's verify tray and on to the reviewers. It shows what the board says and nothing more. Watch the work here; change it on
the board.

## Where to find it

1. Open a board that a crew works on. Such a board has the **Office** tab, next to **Board** and **List**. That is a crew
   board (the crew's own shadow board), and also the main board a crew is linked to, so the people who work on the main
   board can watch its crew from there.
2. Press **Office**. The room opens at the board's own address with `/office/` in front of the board's id. On a main
   board with more than one crew, the tab opens a menu first: pick the crew to watch, and the room opens with `?crew=`
   and that crew's id. A main board with one crew opens that crew straight away.
3. To go back, press the arrow at the top left, or press the board's name.

The office shows the crew of the board it is opened from. A board with no crew has no Office tab. Opening its office
address by hand shows *No crew works on this board*. A crew that is switched off does not count.

## The desk lights

Each desk has a desk lamp on it, the Boss's and Pia's included. It shows whether the person has work in progress, as the crew monitor reports it:

- a **green lit shade** (the glow under the lamp) means the person has a card in progress, or a subtask of theirs under one;
- **no glow** under the shade means the person has nothing in progress (the lamp itself stays the same colour);
- a **grey dashed outline** means no status yet. The office never guesses in progress or not.

The glow says the state as well as the colour. Hover the light (or tap it on a phone) to read the status text: "Busy: …",
"Idle since 21:40", or "No status yet". The light changes while you watch, without a reload. The status comes from the crew monitor, which reads the board (see
[The crew monitor](/help/agents/crew-monitor)).

## Who can see it

Only the team's staff see the Office tab. A customer's contact does not see it. The office shows what the board shows: a
member who cannot open the crew board cannot open its office either. The people in the room are the crew's members on that
board, and anyone a task is assigned to who is not in the crew. Names are shown. Email addresses are not.

## What you see

- Folders on the desks and in the trays, one per task, with its title when you hover it.
- People at their desks, each with the role they play in the crew.
- The **What happens** button at the top explains every scene: a parcel is a batch of new tasks, a jar holds the bugs, and
  so on.

The room updates every few seconds, so it follows the board with a short delay. The **Demo** button in the office plays a
made-up board through every scene, for when there is no work to watch.
