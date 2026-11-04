---
title: Give a customer a window into one project
summary: A start-to-finish example of adding a customer, sharing one board, choosing what they see, and inviting them
requires: staff, team-admin
topics: tutorial, customer, share a project, invite, window, walkthrough, example, customer portal
order: 90
---

In this walkthrough you are an owner or admin of a team called **Acme Studio**. You are building a website for a
customer, **Brightside Bakery**, and you want them to follow one board, **Website relaunch**, and to comment on
it, without seeing your internal notes or any other board.

You will: add the customer, file the board under it, decide which tasks it shows, invite the contact, and check
the result. It takes about ten minutes. The concepts behind each step are on
[Customers and contacts](/help/team/customers-and-contacts) and
[What customers see](/help/team/what-customers-see).

## Before you start

- You are an owner or admin of the team. A plain member can file a board under a customer but cannot add the
  customer or make the invitation link.
- You have, or can make, the board **Website relaunch** in the team.
- You know where to send a link to the person at Brightside Bakery. Nothing is emailed by the app.

## 1. Switch to the team

Click the workspace button at the top of the sidebar and pick **Acme Studio** under **Your Teams**. Customers
only exist inside a team, so the **Customers** entry only shows once a team is active.

## 2. Add the customer

1. Open the workspace menu and choose **Customers**.
2. Type **Brightside Bakery** under **New customer name** and click **Add customer**.

The customer appears with "0 projects · 0 contacts" and opens at once, ready for contacts. Leave the dialog open or
close it; you will come back to it in step 5.

## 3. Review the tasks before you file the board

This step is the one people skip. New tasks start as **Shared with customer**, so anything already on the board
will be visible to the customer the moment a contact exists.

1. Open **Website relaunch**.
2. Look at each card. A card that already says **Team only** is hidden from customers. A card without the mark is
   shared.
3. Open every task that should stay internal (pricing, "client is slow to reply", agency notes). In its header
   click the button that reads **Shared with customer**. It changes to **Team only** and a toast offers **Undo**.
4. Read the comments on tasks you want to share. Comments start team only, but a teammate may have shared one.
   A shared comment shows no **Team only** mark; a team-only one does.

Nobody outside the team can see anything yet, because the board is not filed under the customer and no contact
exists. You are tidying before the door opens.

## 4. File the board under the customer

1. In the board header, click the small button that reads **Team only**.
2. Choose **Brightside Bakery**.

The button now shows the customer's name. When you next open **Customers**, Brightside Bakery reads "1 project".

## 5. Invite the contact

1. Open **Customers** again and click **Brightside Bakery** to open it.
2. Under **Invitation links**, type **Maria at the bakery** in **Who is it for? (optional)**.
3. Click **Create link**, then **Copy**.
4. Send the link to Maria. The link is shown once and works for one person, for 14 days.

If you do not copy it in time, revoke it with the cross next to it and make another. See
[Invite a customer contact](/help/team/invite-a-contact) for the details.

## 6. What Maria does

Maria opens the link. She sees "You're invited". If she has no account she clicks **Sign in or create an
account** and makes one; the link works even if the instance is otherwise closed to sign-ups. Back on the
invitation page she clicks **Accept invitation**.

She lands on the board list. **Website relaunch** is there, in her personal workspace, with Brightside Bakery's
name beside it. She opens it and sees the shared tasks only, and can comment on them. She has no Messages, Time or
Settings tab.

## 7. Check it worked

1. Reopen the customer. **Contacts** now lists Maria with her name and email.
2. Add a comment to a shared task. The comment starts team only (the box reads "Add an internal comment…"). Click
   the lock to turn it into an eye, and the box reads "Write to the team and the customer…". Send it. Ask Maria
   whether she can see it.
3. Add a second comment to the same task and leave it team only. Maria should not see this one.
4. Make a task team only and ask whether it disappeared on her side.

If you want to see it with your own eyes, accept a second invitation with a test account in another browser
profile instead of asking.

## 8. Day to day

- **Share more:** open a team-only task and click **Team only** to turn it into **Shared with customer**.
- **Another person from the bakery:** make another link. Each person needs their own.
- **When the project ends:** in the customer's **Contacts** click **Remove contact** next to Maria. To take the
  board back to team only, click the customer's name in the board header and choose **Team only**.

## If something goes wrong

- **"This invitation has already been used or has expired."** Make a new link.
- **Maria sees the board but no tasks.** Every task is team only. Open one and click **Team only** to share it.
- **Maria sees something you did not intend.** Open the task and click **Shared with customer** to make it team
  only.
- **The wrong person accepted.** Remove them under **Contacts** and send a new link.
