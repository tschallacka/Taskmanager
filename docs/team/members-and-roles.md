---
title: Members and roles
summary: The three team roles (owner, admin, member) and what each may do
requires: staff
topics: members, roles, owner, admin, member, permissions, who can, team members
order: 30
---

Everyone in a team has one of three roles. The role decides who may change the team itself. It does not limit
which boards you can open: **every member can open every board of the team**, whatever their role.

You find the list under **Team**, then **Members**. Each row shows the person's name and email address, a badge
with their role, and "(you)" on your own row. Every member of the team can see these email addresses.

## The three roles

| Role | Who they are |
|---|---|
| **owner** | Started the team, or was handed ownership. The team always needs at least one. |
| **admin** | Helps run the team. Appears when an owner transfers ownership (the old owner becomes an admin). |
| **member** | Everyone who joined with the join code. |

## What each role may do

| Action | Member | Admin | Owner |
|---|---|---|---|
| Open every board of the team | yes | yes | yes |
| See the member list and the join code | yes | yes | yes |
| Leave the team | yes | yes | yes, unless the only owner of a team that has other members |
| See customers and their contacts | yes | yes | yes |
| File a board under a customer, or back to team only | yes | yes | yes |
| Rename the team | no | yes | yes |
| Generate or rotate the join code | no | yes | yes |
| Remove a member | no | yes (not an owner) | yes |
| Add, rename or remove customers, and make or revoke invitation links | no | yes | yes |
| Change the board defaults | no | yes | yes |
| See the **Keys** section | no | yes | yes |
| Transfer ownership | no | no | yes |
| Delete the team | no | no | yes |

Hover over a role badge to see a one-line reminder of what that role may do.

If you cannot do something, the button is hidden or disabled rather than failing after you click. Where the page
does not hide it, the server still refuses: the rules above are checked there, not only in the page.

## How people get a role

- **Joining** always gives the role **member**. See [Create or join a team](/help/team/create-or-join-a-team).
- **Starting a team** makes you its **owner**.
- **Transferring ownership** makes the person you pick an owner and turns you into an admin.

The Team page has no control that promotes a member to admin on its own, and none that demotes an admin. The only
role change you can make from the page is the ownership transfer.

## Things that are easy to get wrong

- **Role is per team.** You can be an owner of one team and a member of another.
- **Removing a member is not undoing the join code.** The person loses access, but anyone else who holds the code
  can still join, and so can the removed person if they still have it. Rotate the code after you remove someone if
  that matters.
- **The role badge does not control boards.** There is no "read-only member". If someone should only follow one
  project, give them access as a [customer contact](/help/team/customers-and-contacts) instead of making them a
  member.

<!-- requires: team-admin -->
## Doing the owner and admin tasks

The steps for removing a member, transferring ownership and deleting a team are on
[Leave, remove, transfer or delete](/help/team/leave-remove-transfer-delete).
<!-- /requires -->
