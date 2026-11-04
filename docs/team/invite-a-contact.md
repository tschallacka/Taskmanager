---
title: Invite a customer contact
summary: Make an invitation link for a customer, send it, and see it accepted, revoked or expired
requires: staff, team-admin
topics: invite, invitation link, contact, customer, add contact, revoke link, expire, sign up
order: 80
---

A **contact** joins a customer through a one-time **invitation link**. You make the link, you send it, and
whoever opens it and accepts becomes a contact of that customer. Nothing is emailed for you. You can invite
someone who has no account yet: the link lets them make one, even on an instance where sign-up is otherwise
closed.

Only owners and admins can make links. You need a customer first; see
[Customers and contacts](/help/team/customers-and-contacts).

## Make a link

1. Open the workspace menu and choose **Customers**, or open **Team**, then **Customers**, then **Manage
   customers**.
2. Click the customer's name to open it.
3. Under **Invitation links**, type who it is for in **Who is it for? (optional)**. The label is only for you; it
   helps you tell links apart.
4. Click **Create link**.
5. Click **Copy** and send the link to the person yourself (chat, email, wherever you talk to them).

**Copy it now.** The full link is shown only once, right after you create it. If you lose it, you cannot read it
back: revoke it and make a new one.

The link looks like `https://your-instance/invite/` followed by a long code. It works:

- **for one person**: the first account that accepts it uses it up, and nobody else can use it afterwards;
- **for 14 days** from when you made it.

## What the person does

They open the link. The page says "You're invited" and who invited them to follow which customer's projects.

1. If they are not signed in, they click **Sign in or create an account**. After signing in or signing up they are
   brought back to the same page.
2. They click **Accept invitation**.
3. They land on the most recently updated board in their personal workspace, and all of the customer's boards are
   listed in the sidebar.

The customer's boards appear in their **personal workspace**. A contact does not become a member of your team.

If the link is no longer usable they see one of these instead:

- "This invitation link is not valid." The link was mistyped, cut off, or revoked.
- "This invitation has already been used or has expired."

If someone accepts with the wrong account, that account is now the contact. Remove it (below) and send a fresh
link.

## See who accepted

Open the customer in the dialog. **Contacts** lists everyone who has accepted, with name and email. Close and
reopen the customer (or the dialog) to reload the list after someone accepts.

**Invitation links** lists only open links, each with its label (or "Unlabelled link") and "expires" date. A link
that was used or has run out is not listed.

## Revoke a link

Click the cross (**Revoke link**) next to the link and confirm with **Revoke**. The dialog says "Anyone holding the
link can no longer use it." Do this when a link was sent to the wrong place, or you no longer need it.

Revoking does not affect someone who already accepted. To end their access, remove the contact.

## Remove a contact

In the customer's **Contacts** list, click **Remove contact** next to the person and confirm with **Remove contact**.
The dialog says "They keep their account but no longer see this customer's projects." Their live connections to the
customer's boards are closed, so the change takes effect straight away.

They can only come back with a new invitation link.

## What is easy to get wrong

- **A link is the access.** Anyone holding an unused link can accept it. Send it somewhere only the intended
  person reads, and revoke it if it travelled further.
- **Accepting is not the same as being allowed to see everything.** A new contact sees only the tasks and comments
  you marked as shared. Look at [What customers see](/help/team/what-customers-see) before you send the link.
- **Crew accounts cannot accept.** Accounts that belong to an agent crew are refused, and the link stays unused.
- **A link cannot be edited.** To change who it is for, revoke it and make another.
