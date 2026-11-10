---
title: Shadow boards
summary: How a crew's shadow board sits under its real board in the board list, what a crew member sees, and how to open the real board from it
requires: staff
topics: shadow board, crew board, folder, nested, board list, sidebar, breadcrumb, crew home, archived, real board
order: 25
---

A crew works on its own **shadow board**, and a shadow board is always linked to a **real board**. So the board list
does not show a shadow board as a board of its own. It shows it as a **folder under its real board**, and it does that
for everyone who may see the shadow board.

## What the board list shows

- A real board that has shadow boards has a small **toggle** next to its name. Press it to open the folder.
- The shadow boards sit under the real board, indented, one row each. Each row carries the name of its crew, for
  example `Taskmanager Maintenance › crew: taskmanager-maintenance`.
- A folder starts **closed**. Taskmanager remembers whether you left it open.
- A shadow board does not also appear at the top level of the list for someone who sees it in its folder.

A real board with no shadow board has no toggle and looks as it always did.

## The crew's home board

Each crew also has a **home board**, named after the crew, for example `taskmanager Development Center`. It is not a
shadow board of anything, so it stays where it is in the list, at the top level. It carries the label **crew home**, so
it does not look like a stray board.

## A crew member's view

Someone who works for the crew sees the same folder, with a difference:

- The **real board** appears as a row at the top of its folder, shown as read-only. It says that it is the crew's real
  board. It does **not open**: a crew member cannot open the real board, and it shows no tasks.
- The crew board itself opens as usual, with the access a crew has to its own board (see
  [What a crew can and cannot see](/help/crews/what-a-crew-can-see)).

## The breadcrumb and the list of shadows on a real board

- On a shadow board, the header shows a breadcrumb: the real board's name, then **›**, then **(shadow)**. Press the
  real board's name to go back to it.
- On a real board, the header has a **Shadow boards (n)** entry that lists its shadow boards, where n is how many there
  are.

If you can see a shadow board but not its real board, the folder still shows, with the real board's name and no link to
it.

## Archived boards

An archived shadow board does not show in the folder. Archived boards leave the lists, so you find them again through
the archived view (see [Browse projects and pins](/help/workspace/browse-projects-and-pins)).

## Things to know

- A shadow board is never a top-level board for the people who can see its real board. If you cannot find a crew's
  board, look under its real board first.
- Nothing is moved when a board is folded. The tree is only how the list draws the boards: no board changes its team,
  its name or its members.
- The folder is read when you open the list, so a new shadow board appears after you reload.
