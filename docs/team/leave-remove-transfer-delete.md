---
title: Leave, remove, transfer or delete
summary: Leave a team, remove a member, hand ownership to someone else, or delete a team, and what each one cannot undo
requires: staff
topics: leave team, remove member, kick, transfer ownership, delete team, owner, new owner
order: 32
---

This page covers the ways a person stops being in a team, and the two owner-only steps that go with them. All of
them are on the **Team** page, which you open from the workspace menu.

## Leave a team

Any member can leave.

1. Open **Team**, then **General**.
2. Click **Leave Team** (bottom left).
3. Confirm with **Leave Team** in the dialog "Leave this team?".

You land in your personal workspace, on the board list. You lose access to every board of the team at once. You
can come back only with a valid [join code](/help/team/create-or-join-a-team), and you come back as a plain
member.

Two cases to know:

- **You are the only owner and others are still in the team.** **Leave Team** is greyed out. Hover it for the
  reason: "Transfer ownership to another member before leaving." A team is never left without an owner.
- **You are the only member.** The dialog changes to "Delete this team?", and the button to **Delete Team**.
  Leaving then permanently deletes the team and all of its boards, because a team with nobody in it cannot
  exist. This cannot be undone.

<!-- requires: team-admin -->
## Remove a member

Owners and admins can remove other people.

1. Open **Team**, then **Members**.
2. Click the red trash button (**Remove member**) at the end of the person's row.
3. Confirm with **Remove** in the dialog "Remove member?". It reads "Remove *name* from *team*? They will lose
   access to the team's boards."

The person keeps their account and their personal workspace. They are out of the team immediately.

Things to know:

- **There is no remove button on your own row.** To go yourself, use **Leave Team**.
- **An admin cannot remove an owner.** The button is shown, but the server refuses. Only an owner can remove
  another owner, and the last owner can never be removed.
- **Removing does not close the join code.** If the person still has the code, they can join again. Rotate the
  code when that matters; see [Create or join a team](/help/team/create-or-join-a-team).
<!-- /requires -->

<!-- requires: team-owner -->
## Transfer ownership

Use this to hand the team to someone else, or before you leave it as the only owner.

1. Open **Team**, then **Members**.
2. Click the crown button (**Transfer ownership**) on the row of the person who should become owner. It is shown
   for everyone who is not already an owner.
3. Confirm with **Transfer** in the dialog "Transfer ownership?". It reads "Make *name* the new owner of
   *team*? You will become an admin."

Two things happen, one after the other: the person is made an owner, then you are made an admin. If the second
step fails you see "Ownership was transferred, but your own role could not be updated", and for a while the team
has two owners. Reload the Team page to see where the roles ended up.

You cannot take ownership back yourself. The new owner has to transfer it to you again.

## Delete a team

Only an owner can delete a team.

1. Open **Team**, then **General**.
2. Click **Delete Team** (bottom right, in red).
3. Read the dialog "Delete this team?" and confirm with **Delete Team**.

This permanently deletes the team and everything that belongs to it: its boards and their tasks, its customers
(and so their contacts' access), and the team's goals, portfolios, rules and crews. There is no trash and no way
to get it back. Everyone in the team loses access at once.

If you only want people out, remove them one by one instead, or transfer ownership and leave, which keeps the team
for the others.
<!-- /requires -->

## What is easy to get wrong

- **Leaving is not deleting.** The team and its boards stay for the people who remain, unless you were the last
  member.
- **Leave Team on a team of one deletes the team.** The button is the same one; only the dialog title tells you.
  Read it before you confirm.
