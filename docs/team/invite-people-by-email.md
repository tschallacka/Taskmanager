---
title: Invite people to a team by email
summary: Invite one person to your team by email address, as a member or an admin, and see the invitation accepted, withdrawn or expired
requires: staff, team-admin
topics: invite, invitation, email, add member, new member, invite link, accept invitation, expire, withdraw, closed sign-up, admin role
order: 25
---

An **email invitation** brings one named person into your team. You type their address, they get a link, and when
they accept they become a member (or an admin). It differs from the
[join code](/help/team/create-or-join-a-team) in one way that matters: the link works for that address only.

| | Join code | Email invitation |
|---|---|---|
| Who can use it | Anyone signed in who has the code | The account with the invited address |
| How often | As often as they like, until you rotate it | Once |
| Role they get | Member | Member or admin, as you chose |
| Person without an account | Must sign up first, which a closed instance refuses | Can create an account with the invited address through the link, even when sign-up is closed |
| Lifetime | Until rotated | 14 days |

## Invite someone

Switch to the team first (see [Teams and workspaces](/help/team/teams-and-workspaces)). A personal workspace has no
invitations.

1. Open **Team**, then **Members**.
2. Under **Invite by email**, type the address, for example `sam@example.com`.
3. Pick a role. **Member** is the default. **Admin** is in the list only if you are an owner.
4. Click **Invite**.

What you see next depends on whether the instance can send mail.

- If it can, the page says "Invitation mailed to sam@example.com." The mail names the inviter and the team, and says
  the link works for that address only and expires in 14 days.
- If it cannot, or sending failed, the page says "Send this link to sam@example.com. This instance cannot send mail,
  or it failed." Click **Copy** and send the link yourself.

Either way the link is shown only now. Taskmanager stores a fingerprint of it, not the link. If someone loses it,
invite the address again. Invitations still waiting are listed under the form with the address, the role and an
"open until" date.

You cannot invite someone who is already in the team ("That person is already on the team."). The check works only
for addresses that already have an account.

## Roles on offer

- **Member**: any owner or admin may invite one.
- **Admin**: only an owner may. An admin who tries gets "Only an owner can invite an admin", and the **Admin**
  choice is hidden from admins.

Nobody can be invited as an owner. Ownership moves by transfer, see
[Leave, remove, transfer or delete](/help/team/leave-remove-transfer-delete). What each role may do is on
[Members and roles](/help/team/members-and-roles).

## What the invited person sees

The link opens a page that says "You're invited" and, for example, "Sam Lee invited you to join Acme." The page
never shows the invited address. Whoever opens the link has to know it. An invitation is also no sign-in: opening
the link does not sign anyone in, and it does not look at which account is signed in until you press a button.

- **Not signed in, with an account:** **I have an account: sign in**. They sign in as usual, with the invited
  address, and come back to the invitation.
- **Not signed in, without an account:** **Create an account**. They must use the invited address, typed again
  by hand, or a sign-in provider that reports it (Google, GitHub, Discord or your single sign-on, when the
  instance offers them). A provider counts only when it says it verified the address. Then they come back to the
  invitation.
- **Signed in with the invited address:** "Signed in as ..." and the button **Accept invitation**. The team is
  added to that account.

On accepting, the team becomes their active workspace and the project list opens. The link is then spent.

## Wrong account, second use, expired link

- **Signed in with another address.** The page says the invitation was sent to another address than the one of this
  account, without naming it, and offers **Sign out**. Nothing is spent, so the right account can still use the
  link. Capitals do not matter. An invitation matches the account's own address; an account has no extra
  addresses (aliases) that would match.
- **Used twice.** The first account to accept takes the link. A second try shows "This invitation has already been
  used or has expired." Withdrawn and expired links show the same message.
- **A link that never existed**, for instance with a typo, shows "This invitation link is not valid."
- **Already in the team.** Accepting spends the link and changes nothing, not even the role.
- **Crew accounts** cannot accept an invitation. The link stays unspent.

## When sign-up is closed

A team invitation still lets its person create an account on an instance that refuses new accounts, but only an
account with the invited address. Opening the link stores it in a cookie for 24 hours, so it survives the trip
through a sign-in provider. When an account is created, the instance checks that the cookie holds an unspent,
unexpired invitation **and** that the new account's address is the invited one. Any other address is refused with
"Sign-up is closed here", so a link alone leaves no stray account behind. The same holds for password, email code
and single sign-on. With a sign-in provider the address comes from the provider and must be marked verified.

The instance admin closes sign-up; the setting is not on any team page.

## Expiry, withdrawing and inviting again

- **Expiry.** A link works for 14 days. Then the invitation drops off the list and the link shows the expired
  message. It cannot be extended: invite the address again.
- **Withdraw.** Click **Withdraw** on a row. The link stops working at once. An owner can withdraw any open
  invitation. An admin can withdraw only the ones they sent, and does not see the button on the others.
- **Invite again.** A new invitation for an address replaces the open one, so only one link per person is live. That
  replaces a withdrawal too, so an admin cannot invite an address whose open invitation someone else sent. The
  message says so, and an owner or the sender withdraws it first.
- **Already accepted.** Withdrawing does nothing for someone who is in. To take them out, see
  [Leave, remove, transfer or delete](/help/team/leave-remove-transfer-delete).

## What is easy to get wrong

- **A mistyped address** sends the invitation to someone else, who can accept it. Check before you click
  **Invite**, and withdraw at once if you got it wrong.
- **An invitation is not a customer link.** A customer contact is added from **Customers** and sees only what is
  shared with customers. See [Invite a customer contact](/help/team/invite-a-contact).
