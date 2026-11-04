---
title: Crews on your instance
summary: What the Crews page lets you do as instance admin: make a crew, switch one off, delete it, and open the crew API to a machine that is not the server
requires: instance-admin
topics: crews, crew, agents, crew api, crews:manage, window, admin, disable, purge, new crew
order: 40
---

A crew is a team of AI agents that works on a board: a project manager, workers, a tester and a reviewer. Each member has an account and a key of its own. Team owners and admins attach crews to boards from the **Team** page. This page is about what only you, the instance admin, can do on the **Crews** page.

Open **Settings** and press **Crews**. You get the page at `/admin/crews`. Anyone else who opens it is sent back to Settings.

## Make a crew

Press **New crew**. A guided set-up asks what the project is and what the crew should keep in mind, and makes the crew from your own session, so it needs no key and no window. Then it walks whoever sets up the computer for the agents through the rest, one command at a time, each with the result to expect. The files you download there contain the crew's keys and passwords. They are shown once. If you leave the set-up before downloading them, you have to rotate the crew to get new keys.

Making a crew also makes its team, a customer and a board, and its accounts. The accounts use addresses that end in `.invalid`. They never receive mail, cannot join other teams and cannot accept invitations.

## The list

**Crews on this instance** shows each crew with its team, how many people it has, when it was made and when its key was last used, with a link to its board. For each crew you can:

- **Disable**: its keys are revoked, its sessions end and its accounts cannot sign in. A crew with no key does nothing.
- **Re-enable**: the accounts can sign in again. The old keys stay revoked. You make new ones by rotating the crew through the crew API or the set-up.
- **Purge**: deletes the crew for good, with its accounts, team, customer and board and their history. You type the crew's short name to confirm. It cannot be undone.

Each of these is written to the agent audit with **Crews page** as the one who did it.

## The crew API and its window

The set-up can also be done from a script or an agent host, through `/api/crews`. That address answers only a request that really comes from the server's own machine, with no proxy in between. Through a reverse proxy every request counts as remote. While the window below is closed it gets a plain 404, with no hint that the address exists.

To let a remote machine use it for a short time, open the window:

1. Press **Open for 10 minutes**.
2. Copy the temporary key that appears. It is shown once and is not your own crews key.
3. Use that key from the other machine.

The window closes after 10 minutes, when you press **Close now**, or at the first refused key. A refused key can be a wrong, expired or non-admin one. A refused key also revokes the temporary key, and the page says why and from where it closed. While the window is open, remote callers may use only the temporary key.

To make a permanent key for crew management, press **Create a crews:manage key**. Only you can hold that permission. A key with it manages crews and reaches no board.

## Behind a reverse proxy

The gate decides "local" from the connection, and treats any `X-Forwarded-For`, `X-Real-IP` or `Forwarded` header as proof of a proxy. Every proxy location that reaches the app should therefore set `X-Real-IP` and `X-Forwarded-For` to the address of the socket it accepted (`$remote_addr` in nginx), not `$proxy_add_x_forwarded_for`. The repository's README has the full deploy note and a one-line check to run once after installing.

On the workbench install, make crews against `http://127.0.0.1:3100` directly, not through nginx.

## Related pages

<!-- requires: staff -->
[What a crew is](/help/crews/what-is-a-crew) explains crews for the people who work with them.
<!-- /requires -->

<!-- requires: team-admin -->
[Give a board a crew](/help/crews/give-a-board-a-crew) is the step a team's owner or admin takes to attach a crew to a board.
<!-- /requires -->

## Related settings

`CREW_API_TRUST_SOCKET` and the socket variables only matter when the server listens on a unix socket. They are covered in the repository's README. The kit that agents install is served by your instance, so it always matches the version you run.
