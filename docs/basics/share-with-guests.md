---
title: Share a board with guests
summary: Open a board's Share dialog to see who is on it, invite guests by email, set their role, and approve requests from manager guests
requires: staff
topics: share, guest, invite, editor, manager guest, domain, approval, request, access, who has access, private, avatar
order: 105
---

The **Share** dialog is where you decide who is on a board. It covers two groups:

- **Your team.** Everyone on the team sees every team board. You do not add them here.
- **Guests.** People from outside the team, such as a client's staff or an agency, whom you let onto this one board.

This page is about guests. A different feature, the read-only link for people without an account, is described in
[Share a board by public link](/help/basics/share-a-board). A guest has an account and signs in. A public link reader
does not.

## Who gets the dialog

Click **Share** at the top right of a board.

- A **project admin** gets the dialog described here. That means an owner or admin of the team, the board's owner, and
  anyone given the **Manager** role in the board's **Settings**, in the **Members** section. On a personal board, you are
  the project admin.
- Any other team member gets only the public link panel.
- A guest who was made a manager guest gets a smaller version of the dialog.

Next to **Share** there is a stack of avatars (up to four, then *+3* and so on). It is hidden on narrow screens. Click
it to open the same dialog. The stack shows the people of the board, the same list the assignee picker uses. Hover an
avatar for the [person card](/help/basics/person-card-and-profiles).

## Boards are not private for the team

There is no switch that makes a team board private to part of the team. Under **Access settings** the dialog says
*Everyone on* followed by your team's name and *can see this board.* On a personal board it says *Only you can see this
board.* Under both it says *Guests see only what is not marked private.* "Private" here means **Team only** tasks and
comments. See [Who sees a task](/help/basics/task-visibility).

## What a guest can do

A guest reads a board the way a customer's contact does: shared tasks and comments only, never the Team only ones. They
can add tasks and reply. They do not see the team's other boards or the board's **Messages**, **Time** and **Settings**
tabs. The board opens in their personal workspace.

## Invite a guest

1. Open **Share**. In **Invite with email**, type the address.
2. Pick a role next to it: **Editor** or **Manager guest**.
3. For a manager guest, check the domain field (see below).
4. Click **Invite**.

The dialog then shows the invitation link. If your instance can send mail, it says *Invitation mailed to ...*.
Otherwise it says *Send this link to ...*, with a **Copy** button. The link works for that address only. It expires
after 14 days. Inviting the same address again withdraws the earlier link.

The guest opens the link, which says *You're invited*, signs in or creates an account with that exact address, and clicks
**Accept invitation**. They land on the board.

The dialog refuses an address that already sees the board and an address that is not valid. On an archived board you
cannot invite, approve or change a guest: unarchive it first.

Copy the link when it appears. The dialog keeps it only until you leave the board or reload the page. If you lose it,
click **Resend** on the invitation under **Who has access**. That makes a new link, valid for another 14 days, and the
old one stops working. It is mailed when the instance can send mail and shown once otherwise. A project admin can
resend any open invitation, a manager guest only their own. A request that still waits for approval has no link yet.

## The two roles

An **Editor** is a plain guest and cannot invite anyone. A **Manager guest** may also invite more guests, as editors, at
one company domain, and must ask you for any other address.

## A manager guest's domain

When you invite a manager guest, the field **Domain this manager guest may invite at** is filled in from the address you
typed, for example `superfabulousshop.com`. Change it if needed.

- The domain is exact. `shop.com` takes `anna@shop.com`, not `anna@mail.shop.com` and not `anna@notshop.com`.
- Public mail providers such as gmail.com or outlook.com cannot be used. The dialog says *is a public mail provider*.
  Invite people at those providers one by one yourself.
- A manager guest with **no domain** has to ask for every address.
- Under **Who has access**, a manager guest has a chip after **May invite at** showing their domain. Click it, type a new
  domain and press Enter to save. Escape cancels.

## Requests from manager guests

When a manager guest types an address outside their domain, their button reads **Ask** and they must give a reason of at
least three characters. No link is made. The request waits in the list as *Waiting for approval*, with the reason in
quotes.

You, and every other project admin, are told in your [Inbox](/help/workspace/inbox) (*... asks to invite ... to ...*,
with the reason). The **Share** button also shows a number for the requests waiting. You can decide in either place: the
Inbox item has **Approve** and **Decline** buttons, and so does the request in **Share**.

- **Approve** turns it into a normal invitation. If your instance can send mail, the link is mailed. Otherwise it is
  shown for you to copy, in the Inbox item or under **Who has access**, and only in that browser view. The manager
  guest who asked gets an Inbox message that it was approved.
- **Decline** closes it, and the manager guest is told. Neither place has a field for a note to them.

## Change or remove a guest

Under **Who has access**, each guest has a role menu, so you can switch an editor to a manager guest and back. Switching
to **Editor** drops the domain. **✕** next to a guest turns into **Remove?**; click it again to confirm, or click
elsewhere to cancel. A removed guest loses access at once. To let them back, invite them again. **Withdraw** cancels an
invitation that was not accepted yet.

Your team members are listed there too, with a badge for their role on the board. **Manager** is what makes someone a
project admin. Everyone on the team can open the board whatever the badge says.

## Also in the dialog

- **Public link** shows **On** or **Off**. Click it for the controls described in
  [Share a board by public link](/help/basics/share-a-board).
- **Notify me when tasks are added to the project** sends you a notice for each new task.
- **Copy board link** copies the board's address. Only people on the board can open it.
