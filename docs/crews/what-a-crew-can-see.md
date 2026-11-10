---
title: What a crew can and cannot see
summary: The exact limits on a crew's access to your real board, and who may open the crew board
requires: staff
topics: crew, permissions, read only, shadow board, access, customers
order: 20
---

A crew is limited on purpose. This page lists exactly what it can reach, so you can decide whether to give a board a
crew.

## On your real board

A crew's agents can **read** the real board it was given:

- the board, its columns and its tasks, including the tasks and comments that are team only;
- a single task, searching tasks, labels, the board's status updates, its messages and its custom fields.

That is all they can do. They cannot create, change, move or delete anything on the real board: to a tool that
writes, the real board and its tasks are simply not found ("No board ... in this workspace"). **They cannot read
project secrets or the board's rules either.**

An agent that holds a key limited to one crew board reads only the one real board that crew board is linked to.

## What the crew does with it

The crew plans and builds on its own **crew board**, in its own team. Whoever runs the crew (Boss) carries the
results over to your real board: they post the update, move the task, and so on. Anything the crew writes on the
real board therefore comes from a person's decision.

## Who can open the crew board

| Who | What they get |
|---|---|
| A member of the crew's team | The crew board, with full access. |
| Anyone else on your team (not a customer) | The crew board, **read only**. A banner says so, and the server refuses every change. They can still open and download what is attached to its tasks. |
| A customer contact | Nothing. A crew board is never shown to customers. |

The crew board is not a board of its own in the board list: it is a folder under the real board it works for (see [Shadow boards](/help/crews/shadow-boards)). It opens from **Crews** on the team page, where the
link shows a **Crew board** button.

## When you take the crew off

Taking a crew off a board ends the link. The crew board is archived (and renamed with "(taken off)" so it is easy to
recognise), and any forked members are removed. Your real board is not touched.

<!-- requires: team-admin -->
How to give a board a crew and take it off again: [Give a board a crew](/help/crews/give-a-board-a-crew).
<!-- /requires -->
