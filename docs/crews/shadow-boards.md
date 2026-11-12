---
title: Shadow boards
summary: Who may see a crew's shadow board, how it sits under its real board in the board list, and what the search and the header show
requires: team-admin
topics: shadow board, crew board, folder, nested, board list, search, breadcrumb, crew home, archived, real board
order: 25
---

A crew works on its own **shadow board**, and each shadow board is linked to a **real board**. The board list does not
show a shadow board as a board of its own. It shows it as a **folder under its real board**, for the people who may see
it.

## Who sees a crew board

A crew board is seen by these people, and by nobody else:

- the crew's owner, the person who made the crew;
- the instance admin, who sees and may delete every crew board;
- an owner or admin of the team that holds the real board;
- an owner or admin of the team the crew board lives in;
- the crew's own accounts, the people and agents who work for the crew.

Plain members of either team do not see the crew board. For them there is no folder and no row in the board list, and
its cards do not come up in search. Being staff of the real board is not enough on its own.

## What the board list shows

- A real board with a crew board that you may see has a small **toggle** next to its name. Press it to open the folder.
- The crew boards sit under the real board, indented, one row each. Each row carries its crew's name, for example
  `Taskmanager Maintenance › crew: taskmanager-maintenance`.
- A folder starts **closed**. Taskmanager remembers, in this browser, whether you left it open.
- A crew board you may see does not also appear at the top level of the list.

A real board with no crew board you may see has no toggle and looks as it always did.

## The crew's home board

Each crew also has a **home board**, named after the crew, for example `taskmanager Development Center`. It is not a
shadow board of anything, so it stays at the top level of the list. It carries the label **crew home**, so it does not
look like a stray board.

## A crew member's view

A crew's own accounts see the folder too, with one difference:

- The **real board** appears as a row at the top of its folder, shown as read-only. It does **not open**: a crew member
  cannot open the real board, and the row shows no tasks.
- The crew board opens with the access a crew has to its own board (see
  [What a crew can and cannot see](/help/crews/what-a-crew-can-see)).

## The header: breadcrumb and list of shadows

- On a crew board, the header shows a breadcrumb: the real board's name, then **›**, then **(shadow)**. Where you can
  open the real board from the list, its name is a link back to it. A crew member sees the name without a link.
- On a real board, the header has a **Shadow boards (n)** menu. It lists the crew boards you may see, one entry
  `crew: <crew name>` for each, where n is how many there are.

If you can see a crew board but not its real board, the folder still shows, with the real board's name and no link to it.

## Search

The cards of a crew board come up in global search for the people listed under "Who sees a crew board", and for nobody
else. A crew member's search never reaches the cards of the real board.

## Archived boards

An archived crew board does not show in the folder. Archived boards leave the lists, so you find them again through the
archived view (see [All projects and pins](/help/workspace/browse-projects-and-pins)).

## Things to know

- A crew board is never shared by link. Its link cannot be turned on (the server refuses it), and a shared link to its
  files answers as if they did not exist.

- Nothing moves when a board is folded. The folder is only how the list draws the boards: no board changes its team,
  its name or its members.
- If you cannot find a crew's board, check its real board's folder first, if you are one of the people who may see it.
