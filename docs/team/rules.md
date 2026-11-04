---
title: Team rules
summary: One if-this-then-that rule that runs on every board of your team
requires: staff
topics: rules, automation, team rules, if this then that, column-free, by name
order: 40
---

A **team rule** is a rule you write once and that then runs on every board of the team. It is the same kind of
rule as the ones you can write on a single board ("when a task is moved to Done, add the label *shipped*"), but
instead of copying it to ten boards you write it under **Rules** on the team page and it applies to all of them.

Team rules run **before** a board's own rules. A rule written on a board keeps working next to them.

## What a rule is made of

Every rule has three parts, in this order:

1. **A trigger**, the event that starts it. One of: a task is added, moved to a column, completed or reopened;
   a task is assigned; a due date is set or changed, or passes; a comment is added; a linked pull request is
   merged or closed; checks fail on a linked pull request.
2. **Conditions** (optional), which must all be true for the rule to go on: the task is in a column, is assigned to
   someone or to nobody, has a label, has (or has no) due date, or is team only or shared with customers.
   A rule holds up to 10 conditions.
3. **Actions**, what the rule does: move the task to a column, assign or unassign it, set a due date some days from
   now, mark it complete or reopen it, add a label, add a comment, create a subtask, or set it team only or shared
   with customer. A rule holds up to 20 actions.

The builder shows the whole rule as one plain sentence while you build it, so you can read it back before saving.

## Two kinds of team rule

Boards do not share their columns, so a team rule has to say how it finds a column. You choose that per rule:

- **By name.** Columns are written as names ("Done"), and people are picked from the team. On each board the name is
  matched ignoring capital letters. **A board that has no column of that name skips the rule** instead of failing.
- **Column-free.** The rule uses nothing that needs a column or a particular person, so it fits every board. The
  triggers and actions that need a column or a person ("moved to a column", "in a column", "move it to a column",
  "assign it to someone") are greyed out with the note *needs "by name"*.

If you switch a rule to column-free, the steps it cannot hold are removed so you never save something the server
would refuse.

## Who can see and who can change them

Every member of the team can read the rules and their run log. Only an owner or admin can add, change, switch off or
delete them. Only the **owner** of the team can let a team rule set a task's visibility (team only or shared with
customers): a rule with that action stops working if its author is no longer the owner.

<!-- requires: team-admin -->
## Write a team rule

1. Open **Team** in the workspace menu, then **Rules**, then **New rule**.
2. Choose how the rule finds columns: **by name** or **column-free**.
3. Give the rule a name (optional), pick the trigger, add conditions if you need them, and add the actions.
4. Check the sentence under the form. When it reads the way you mean it, click **Create rule**.

A team can hold up to 50 rules. Rules run in the order they are listed. Each rule has a switch to turn it off
without deleting it, and a run log that shows each run as **Ran**, **Failed** or **Stopped to prevent a loop**
(a rule that keeps triggering itself is cut off).
<!-- /requires -->
