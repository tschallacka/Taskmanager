---
title: Teams and workspaces
summary: What a team is, how it differs from your personal workspace, and how to switch between them
requires: staff
topics: team, workspace, personal workspace, switch, switcher, organisation, organization
order: 10
---

Taskmanager has two kinds of workspace: your **personal workspace** and **teams**. You are always in exactly one
of them, and what you see in the sidebar (boards, customers, the Team page) belongs to that one.

## Personal workspace

Your personal workspace is yours alone. The boards you make there are visible only to you. It has no members, no
join code and no customers, and a new board there always starts with the built-in columns (Backlog, To do,
Verify, Done).

## A team

A team is a workspace shared by several people. Everyone in the team can open **every board of the team**, and
anything made while the team is the active workspace belongs to the team, not to the person who made it.

A team has:

- **Members**, each an owner, an admin or a member. See [Members and roles](/help/team/members-and-roles).
- A **join code** that lets other people in. See [Create or join a team](/help/team/create-or-join-a-team).
- **Customers**, the outside parties you share boards with. See
  [Customers and contacts](/help/team/customers-and-contacts).
- **Board defaults**, the columns a new board starts with. See [Board defaults](/help/team/board-defaults).
- Rules and Crews, which have their own sections on the Team page.

## Switch between workspaces

1. Click the workspace button at the bottom of the sidebar, above your name. It shows the name of the workspace you are in, with a
   **Team** badge when it is a team.
2. Pick **Personal Workspace**, or one of your teams under **Your Teams**.

Switching reloads the board list for the new workspace. If you had a board open, you are taken back to the
board list, because that board belongs to the workspace you just left.

The same menu has the other team entries:

| Menu item | What it does |
|---|---|
| **Create Team** | Starts a new team. Only shown to people who are allowed to create teams. |
| **Join a team with a code** | Joins an existing team. |
| **Customers** | Opens the customers of the active team. Only shown while a team is active. |
| **Team** | Opens the Team page. Only shown while a team is active. |

If you are not allowed to create teams, the menu says "Teams are created by an admin" and offers the join link
instead of **Create Team**.

## The Team page

Open **Team** from the workspace menu. It has a section for each part of the team:

- **General**: the team name, the join code, **Leave Team**, and (for owners) **Delete Team**.
- **Members**: who is in the team and their roles.
- **Customers**: the team's customers.
- **Board defaults**: the starting columns of a new board.
- **Rules** and **Crews**: automation and agent crews for the team.
- **Keys**: only shown to owners and admins.

If you are in your personal workspace, the Team page only says so and asks you to pick a team first.

## Easy to get wrong

- **A board belongs to the workspace it was made in.** A board made in your personal workspace does not appear
  in the team, and the other way round. There is no control for moving a board between workspaces.
- **The active workspace is a setting of your sign-in**, not of a board. If a board you expect is missing, check
  the workspace button first.
- **Everyone in the team sees every team board.** Team members have no per-board list. To show a board to someone
  outside the team, invite them as a guest (see [Share a board with guests](/help/basics/share-with-guests)) or use a
  [customer](/help/team/customers-and-contacts).

<!-- requires: team-admin -->
## Rules and keys

As an owner or admin you also manage the team's automation and agent access:
[Team rules](/help/team/rules) run on every board of the team, and [Team keys for agents](/help/team/keys) let an
agent work in the team.
<!-- /requires -->
