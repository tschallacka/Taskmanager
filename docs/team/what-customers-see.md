---
title: What customers see
summary: Which tasks and comments are shared with a customer, how to change that, and what a contact can and cannot do
requires: staff
topics: team only, shared with customer, visibility, customer sees, contact, internal comment, share task, privacy
order: 70
---

A customer contact never sees a whole board. They see the **tasks** and **comments** you have marked **shared
with the customer**, and nothing else. This page explains how that choice is made, how to change it, and what a
contact can do with what they see.

## Two settings: tasks and comments

Every task is either **Team only** or **Shared with customer**. Every comment on a task is too. The two are
independent: a shared task can hold both shared and team-only comments, and a contact only reads the shared ones.

Neither setting does anything on a board that is not filed under a customer, because there is nobody to see it.
The moment you [file the board under a customer](/help/team/customers-and-contacts) that has contacts, the
settings take effect.

### Tasks

- **New tasks start shared.** A task made on any board of the team starts as **Shared with customer**.
  This is the opposite of comments, so check before you file a board under a customer.
- A task that is team only shows a **Team only** mark on its card.
- To change it, open the task and click the button in its header, which reads **Team only** or **Shared with
  customer**. A toast tells you what changed and offers **Undo** for a few seconds.
- A team-only task, and everything under it, does not exist for a contact: not on the board, not in search, not
  by its link, and not its attached images. It is not even counted.
- A subtask made under a team-only task is team only too.

Tasks created by the GitHub integration take their sharing from that board's GitHub settings, where the choices
are named **Team only** and **Shared with customer** as well.

### Comments

- **Your comments start team only.** The comment box reads "Add an internal comment…". A lock beside it means team
  only; an eye means shared. Click it to switch before you send. When shared, the box reads "Write to the team
  and the customer…".
- A **reply** starts with the visibility of the comment it answers, so an answer to a team-only note stays team only
  unless you change it.
- Team-only comments are marked **Team only** in the thread.
- To change one you wrote, open its menu and choose **Share with customer** or **Make team only**. Only the author
  can change it.
- Comments from a contact are always shared. A contact cannot write a team-only comment.

## What a contact can and cannot do

| | Contact | Team member |
|---|---|---|
| Open the boards filed under their customer | yes | yes |
| See shared tasks and shared comments | yes | yes, plus team-only ones |
| See team-only tasks and comments | no | yes |
| Comment, and reply to shared comments | yes (always shared) | yes |
| Edit or delete their own comments | yes | yes |
| Add a task to the board | yes (always shared, no assignee or due date) | yes |
| Edit, move, complete or delete a task | no | yes |
| Change who sees a task or comment | no | yes |
| Use the Messages, Time and Settings tabs | no | yes |
| See custom fields, the board trash, or rename the board | no | yes |
| See which task blocks another | only blockers that are shared; a team-only blocker shows as "a hidden task" | yes |

A contact can be given a task: a person picker in the task offers the customer's contacts too, marked
"(customer)", so assigning work to one is a deliberate choice. A contact cannot assign or set a due date on a task
they add themselves; the team does that.

## Check before you share

There is no "view as customer" button. To be sure what a contact sees:

1. On the board, look for **Team only** marks on cards. Those are hidden from contacts. Cards without it are not.
2. Open the tasks that matter and read the button in the header and the lock or eye on each comment.
3. For a full check, accept an invitation with a test account in another browser profile, and look from there.

## Easy to get wrong

- **Shared is the default for tasks.** If you are about to give someone access to a board that was only used
  internally, go through it first.
- **Changing a task to team only hides it from contacts.** Their own comments on it go out of sight with it, and
  come back if you share the task again.
- **A shared comment on a team-only task is still hidden.** A contact has to be able to open the task first.
- **Words in a task title are shared with the task.** Titles, descriptions, labels, due dates and attached images
  all go with a shared task. Put internal notes in a team-only comment instead.
- **Rules can change sharing too.** A team or board rule can set a task team only or shared with customer. If a
  task keeps flipping, look at the rules.
