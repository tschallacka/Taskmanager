---
title: Customers and contacts
summary: What a customer and a contact are, how a board is filed under a customer, and who can manage them
requires: staff
topics: customer, contact, customer board, portal, share, client, outside, follow projects
order: 60
---

A **customer** is an outside party you do work for. In Taskmanager it is a named group that boards can be filed
under, and that people from the other side can follow. A **contact** is one of those people: a real account that
signs in and sees the customer's boards, but only the parts you chose to share.

Customers belong to a team. You cannot have customers in your personal workspace.

## How the pieces fit

- A **team** has any number of **customers**.
- A **board** of the team is filed under at most one customer, or none. A board under no customer shows **Team
  only** in its header and is not shown to any customer.
- A customer has any number of **contacts**. A contact sees every board filed under that customer.
- Inside a board, each task and each comment is either **team only** or **shared with the customer**. A contact
  only ever sees the shared ones. See [What customers see](/help/team/what-customers-see).

Contacts are not team members. They cannot see the team's other boards, the Team page or its join code. They do
see the name and email address of the team members who work on a board they follow.

## Where customers are

There are two ways to the same list:

- **Team**, then **Customers**. It lists each customer with a count such as "3 projects · 2 contacts". The button
  at the top reads **Manage customers** for owners and admins, **View customers** for everyone else.
- The workspace menu, then **Customers**, which opens the same dialog.

Every member can open the dialog and see the customers and their contacts (name and email). Only owners and
admins can change anything in it.

## File a board under a customer

Any member who can open the board can do this, not only owners and admins.

1. Open the board.
2. In the board header, click the small button that reads **Team only** (or the current customer's name).
3. Pick the customer, or **Team only** to take the board back.

The change is immediate. Contacts of the customer see the board, with only its shared tasks, at once.

**Check the tasks first.** New tasks on a board start out **shared with the customer**, even while the board is
team only. Filing the board under a customer that already has contacts therefore shows them every existing task
that was not marked team only. See [What customers see](/help/team/what-customers-see) for how to check.

## Who can manage customers

| Action | Member | Admin or owner |
|---|---|---|
| See customers and their contacts | yes | yes |
| File a board under a customer | yes | yes |
| Add a customer, rename it, remove it | no | yes |
| Make or revoke invitation links | no | yes |
| Remove a contact | no | yes |

<!-- requires: team-admin -->
## Managing customers

As an owner or admin you manage customers from the dialog described above.

- **Add a customer.** Type a name under **New customer name** and click **Add customer**. The new customer opens
  right away, ready for an invitation link.
- **Rename.** Click the pencil (**Rename customer**), change the name, **Save**. Boards show the new name.
- **Remove a customer.** Click the red trash (**Remove customer**) and confirm with **Remove customer**.
  The dialog says what happens: the customer's boards **stay in the team as team-only boards**, its contacts lose
  access, and open invitation links stop working. The tasks keep their own sharing settings, so if you file a
  board under another customer later, they apply again.
- **Contacts and links.** Click a customer to open it. Under **Contacts** you see who has accepted. The
  **Remove contact** button (a person with a minus sign) ends their access. Under **Invitation links** you make and revoke links.

How to invite someone is on [Invite a customer contact](/help/team/invite-a-contact). A full walk-through from
nothing to a working shared board is in
[Give a customer a window into one project](/help/team/give-a-customer-a-window-into-one-project).
<!-- /requires -->

## What is easy to get wrong

- **Removing a customer does not delete its boards.** They stay in the team as team-only. Only the link between
  the board and the customer goes.
- **Removing a contact does not delete their account.** They keep the account and lose sight of this customer's
  boards. They can come back only with a new invitation link.
- **Renaming is global.** The name changes for the team and for the contacts of that customer.
