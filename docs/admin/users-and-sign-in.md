---
title: Users, sign-in methods and closed sign-up
summary: Decide who may create organisations, which ways of signing in your instance offers, and how to close sign-up and still let invited people in
requires: instance-admin
topics: users, accounts, sign-in, sign-up, oauth, oidc, passkeys, two-factor, email code, invitation, team invitation, closed instance
order: 20
---

This page is about the people on your instance and how they get in. Teams, their members and customers are handled by each team's owners and admins, not here.

## Accounts on this instance

Open the workspace menu (the team switcher at the top of the sidebar) and choose **Accounts on this instance**. It lists every account, oldest first, with the instance admin marked **admin**.

The only thing the window changes is **Can create organisations**. By default a new account can join a team with a code, or work in a customer's portal, but cannot start an organisation. Switch the right on for the people who should. Switching it off again stops new organisations only: the ones that person already owns stay. The switch is fixed for the instance admin.

There is no page for deleting an account or setting someone's password.

## Ways to sign in

Email and password always works. The others are switched on in the server's environment: see [Configuration](/help/admin/configuration) for the variables.

| Method | To switch it on |
|---|---|
| Discord, GitHub, Google | Set `NUXT_PUBLIC_<NAME>_ENABLED=true` and the client id and secret of an OAuth application. Set all three: the server leaves the method off unless the id and secret are there, while the login page decides on the switch alone, so a half-set method shows a button that does not work. |
| Your own OpenID Connect server (Authentik, Authelia, Keycloak, Pocket ID, Kanidm) | `NUXT_PUBLIC_OIDC_ENABLED=true`, `OIDC_DISCOVERY_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`. `NUXT_PUBLIC_OIDC_NAME` is the button's label. |
| Passkeys | On by default. Turn off with `NUXT_PUBLIC_PASSKEYS_ENABLED=false`. |
| Email me a code | `NUXT_PUBLIC_EMAIL_CODE_ENABLED=true`, and `SMTP_HOST` and `SMTP_FROM`. |

Register these addresses with the provider, with your public address in front:

- Discord: `/api/auth/callback/discord`
- GitHub: `/api/auth/callback/github`
- Google: `/api/auth/callback/google`. Google accepts plain `http` only for `localhost`, and while its consent screen is in testing, only listed test users can sign in.
- OpenID Connect: `/api/auth/oauth2/callback/oidc`

GitHub sign-in is a different thing from the GitHub integration. It uses `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. The integration uses `GITHUB_TOKEN`.

A few facts that surprise people:

- A passkey is bound to the hostname in `BETTER_AUTH_URL`. Change the hostname, or move from `localhost` to a real domain, and the passkeys must be added again.
- Two-factor with an authenticator app is always available, in each person's **Settings**, under **Security**. It protects password sign-in. An account with two-factor on cannot sign in with an email code, because the inbox would then stand in for the second factor. Passkeys and the OAuth methods still work.
- An email code is valid for 10 minutes. When sign-up is open, a code sent to an address that has no account creates one.
- For testing, a mail catcher such as Mailpit takes the place of an SMTP server.

## Close sign-up

By default anyone who reaches the login page can create an account. To make the instance private:

1. Create your own account first. The first account always gets in and becomes the instance admin.
2. Set `ALLOW_SIGN_UP=false` and apply it (`docker compose up -d` for Docker, `services.arnotes.allowSignUp = false` on NixOS). When you run the server natively, also set `NUXT_PUBLIC_ALLOW_SIGN_UP=false`, which is what the login page reads. Compose and the module set both for you.

The switch covers every way of creating an account, OAuth and email codes included. People who already have an account can still sign in, with any method. Nobody new gets one, except someone holding a live invitation link (see below).

## Invitations let invited people in

Three kinds of invitation link open an account on a closed instance. Each works once and for 14 days, and each is shown only when it is made.

- **A customer link.** An owner or admin of a team makes it under **Customers** in the workspace menu. Whoever opens it becomes a contact of that customer, and the customer's boards appear in their personal workspace.
- **A team invitation by email.** An owner or admin types an address under **Invite by email** on the team's **Members** page. The link works for the account with that address only, and the person joins the team as a member, or as an admin when an owner invited them as one.
- **A board invitation.** Someone who may share a board invites an address to it as a guest. This is the same mechanism and the same link page as the team invitation.

Opening any of these links makes the server keep the link's token in a cookie for 24 hours, so it survives a trip through a sign-in provider. A customer link admits whoever holds it: while the cookie holds an unspent, unexpired link, an account can be created, with a password, an email code or an OAuth sign-in alike.

A team or board invitation is bound to an address. When an account is created, the instance checks that the cookie holds a live invitation and that the new account's address is the invited one, capitals aside. Any other address is refused, so a link alone leaves no stray account. An account made through a sign-in provider (Google, GitHub, Discord, OIDC) also needs the provider to report that address as verified. The invitation page does not show the address, so whoever opens the link has to know it. Once the link is used, withdrawn or expired, it lets nobody in.

An existing account accepts a team or board invitation only while signed in with the invited address. An account has no extra addresses (aliases) that would match.

Team invitations are mailed when the server has `SMTP_HOST` and `SMTP_FROM` set. Without them nothing is sent, and the inviter gets the link on screen to pass on.

<!-- requires: team-admin -->
The steps are in [Invite people to a team by email](/help/team/invite-people-by-email) and [Invite a customer contact](/help/team/invite-a-contact).
<!-- /requires -->

## Crew accounts

Crews make accounts at addresses ending in `.invalid`. They never get mail, cannot be created through the login page, cannot join or start a team, cannot accept an invitation, and cannot sign in once their crew is switched off. They do appear in **Accounts on this instance**, like any other account. See [Crews on your instance](/help/admin/crews-on-your-instance).
