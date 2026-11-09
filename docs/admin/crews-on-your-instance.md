---
title: Crews on your instance
summary: What the Crews page lets you do as instance admin: make a crew, switch one off, delete it, and open the crew API to a machine that is not the server
requires: instance-admin
topics: crews, crew, agents, crew api, crews:manage, window, admin, disable, purge, new crew
order: 40
---

A crew is a team of AI agents that works on a board: a project manager, workers, a tester and a reviewer. Each member has an account and a key of its own. Team owners and admins attach crews to boards from the **Team** page. This page is about what only you, the instance admin, can do on the **Crews** page.

Open **Settings** and press **Crews**. You get the page at `/admin/crews`. Anyone else who opens it is sent back to Settings.

## Who may make crews

Crews are off until you allow them. Four switches decide it, and each can only narrow what the one above allows:

1. **Users may create crews** (this page, at the top). Off by default. Off means nobody can make a crew, and the Connect window says your admin has not allowed crews. Switching it off disables every crew.
2. **The team** (team settings, owners and admins only). Off by default. A team's owner or admin turns it on for the team's boards.
3. **The board** (board settings). Off by default. A team owner or admin, or a manager of the board, turns it on for that board.

The switches govern the crews of people other than you. Your own crews, keys and management tokens are never held by them: they work as they always did, even with every switch off, and turning the instance switch off leaves your crews enabled.

A crew of anyone else works for its owner only while all three are on, and the check runs on every call. Turning one of them off disables the crews below it: a crew is disabled, not deleted, and a rotate of the crew turns it back on. A person who is not you gets a management token or a crews key only for one board they run, and a crew they make works on one board only.

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

A **management token** (the sidebar link **Get AI management token** on a board) is the other remote key. It works from any machine, through the public address, without opening the window: it lasts 10 minutes, reaches only its own board and carries only the crew permission. Its calls are rate limited per token and per address, with the board's limits for agent calls. A remote call with a management token that has expired or was regenerated answers its own sentence, so the agent can ask for a new token. A remote call with any other key, or no key, still gets the plain 404. Your permanent crews:manage key and the one from the window stay local-only, as before. A remote call with a revoked management token answers the revoked sentence, the same way as an expired or regenerated one.

### Binding a crew to a board

A crew can be made on a real board in the same call. The crew always works on a **shadow board**, made in the crew's own team; the real board is for people. Only the key's owner can bind, and only to a board of a team the owner runs as owner or admin.

- `GET /api/crews/targets` lists the teams the key's owner runs as owner or admin, each with its boards: `{ "teams": [ { "team_id", "team_name", "canCreateBoard", "userboards": [ ... ] } ] }`. A team with no boards is listed with `"userboards": []`. `canCreateBoard` is `true` when the key may make a board in that team (a management token may not, so it always answers `false`). The crew work boards and the shadow boards are left out of the boards.
- `POST /api/crews` takes an optional `projectId` (the real board) and `teamId` (that board's team, optional; `teamId` alone is a 400). Its answer has no keys or passwords: see *The keys and passwords* below. With `projectId`, the answer also adds:
  - `userboard`: the real board, with its shadow boards.
  - `real_board` and `shadow_board`: each with `board_id`, `board_name` and `url`. Give the crew the **shadow board** `url` as its work board.
- `POST /api/crews` with `newBoard: { "name": "..." }` (1 to 120 characters) instead of `projectId`, plus `teamId`, makes a new board in that team first. The board is owned by the key's owner, starts with the team's default columns, and the crew is bound to it as above. The key's owner must be a member of the team, the same check the UI makes when it creates a board (403 `Your key may not create boards in that team.` otherwise). A management token cannot make a board (403). `projectId` together with `newBoard` is a 400, and so is `newBoard` without `teamId`. `rotate: true` with `newBoard` is a 400, because a crew that exists keeps its board. If the crew cannot be made, the board is removed again. The audit row for a made board names the new board.

A userboard has this shape, with snake_case names:

```json
{
  "board_id": "1ddghg5",
  "board_name": "bliep",
  "shadowboards": [
    { "board_id": "2cethu6", "user_id": "335", "crew_ids": [ { "id": "456fgf", "tag": "@wren" } ] }
  ]
}
```

`user_id` is the account that attached the shadow board, and `crew_ids` lists the crew's people on it, with their `@tag`; `id` is that person's account id. A rotate of a crew already on the board keeps its one shadow board. A board that is archived, a crew's own board or a shadow board is refused with a 400, another team's board with a 404, and a board the key's owner may not bind to with a 403. A refused call makes no crew.

`DELETE /api/crews/:slug` takes a bound crew off its boards: the link goes and each shadow board is archived, its notes kept.

## The keys and passwords

**Breaking for API clients:** `POST /api/crews` no longer returns a crew's keys and passwords, for any caller and on a create or a `rotate: true` alike. Its answer lists each person (`id`, `name`, `role`, `email` and `tag`, the person's short key such as `wren`) with no secret, and adds `keys_url` and `keys_note`. The one-time keys come from the keys route.

`POST /api/crews/:slug/keys` makes a fresh set of keys and passwords for every account of the crew. The previous ones stop working at once, as with `rotate`, and a disabled crew is turned back on. It takes the same key as the other crew calls (a management token reaches only a crew bound to its own board) and answers with plain text, one line per secret, to save and source:

```sh
curl -s -X POST -H "Authorization: Bearer $KEY" https://taskmanager.example.com/api/crews/scrapheap/keys -o crew-keys.env
chmod 600 crew-keys.env
```

The first line is a comment that says the file is secret. Each further line is `export TASKMANAGER_CREW_<SLUG>_<PERSON>_API_KEY=...` or `export TASKMANAGER_CREW_<SLUG>_<PERSON>_PASSWORD=...`, with the slug and the person's key upper-cased and dashes turned into underscores. `?format=json` answers the JSON shape the create answer had (the crew, its people with `password` and `apiKey`, the team and the board), for tools that want it. Both answers are `Cache-Control: no-store`. The secrets are never written to the log or to the agent audit.

## Adding the people a crew lacks

A crew made before a role existed has no account for the roles added since. `POST /api/crews/:slug/people` makes those accounts, each with its seat in the crew's team (a contact joins the customer instead), and gives a key and a password for each new person only. It is the same as the people a create makes, and it never rotates anyone: the keys and sessions of the people who are there keep working.

- With no body, it adds every person the kit has that the crew lacks. A body `{"people": ["susy", "janet"]}` or the query `?people=susy,janet` names who to add. A key the kit does not know is a 400 that names it.
- Asked again when nobody is missing, it answers 200 with an empty `people` map.
- The answer has the crew, the team and the board, and `people` with the `password` and `apiKey` of the new people, in the shape of `?format=json` on the keys route. Save them the same way: they are shown once.
- It takes the same key as the other crew calls, and one line goes to the agent audit per call.

`GET /api/crews/:slug` shows the crew's `cast`: every person the kit has, each with `status` `present` or `missing`. Blaze and the Crews page use it to show the roles a crew can still take.

For each new person the call does what crew create does: the account, the seat in the crew's team (or the customer login for a contact) and the key. It sets no board tags, and it does not fork anyone onto a board: a forked member is made with its own fork call.
## Behind a reverse proxy
The gate decides "local" from the connection, and treats any `X-Forwarded-For`, `X-Real-IP` or `Forwarded` header as proof of a proxy. Every proxy location that reaches the app should therefore set `X-Real-IP` and `X-Forwarded-For` to the address of the socket it accepted (`$remote_addr` in nginx), not `$proxy_add_x_forwarded_for`. The repository's README has the full deploy note and a one-line check to run once after installing.

A management token works through the proxy: the gate reads the key from the request, not from the connection, so a proxied call with a management token is accepted and every other proxied call is still a 404.

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
