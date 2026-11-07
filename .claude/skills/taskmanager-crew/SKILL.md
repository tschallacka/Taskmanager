---
name: taskmanager-crew
description: Run a crew of cheap Haiku agents (a project manager and four workers, each with its own browser profile) that build Taskmanager features on a development board, with Claude as the customer and code reviewer, a Haiku log watcher, and a chat line for meetings. Use when asked to "set up the crew", "have the haiku workers build X", or to continue a crew run.
---

# Taskmanager crew

Haiku does the cheap work, Claude (you) spends tokens only where judgement is needed: the customer's
request, answers to the PM, the code review, and the publish. This is how it was run for the
GitHub integration and for the project Settings and Rules work.

## Cast

| key | who | job |
| --- | --- | --- |
| `boss` | the owner's login (you act through it, the crew never does) | applies schema changes, reads reports |
| `scrap` | the customer (you, as ScrapHeap) | asks for things, answers the PM, only sees customer-visible tasks |
| `pm` | Pia Planner (Haiku) | the customer's contact: plans tasks, assigns, pre-checks Verify |
| `w1` `w2` `w3` `w4` | Wren, Wick, Wynn, Wade (Haiku) | build, test in their own browser profile, report |
| log watcher (Haiku) | no login | reads dev log, crew transcripts, new bugs; flags problems to you |

The crew's working directory is `~/crew/`. It is outside the repo on purpose (it holds `creds.json`
with passwords and API keys, never commit it). Everything reusable is in `crew/` next to this file:
copy it with `cp -r .claude/skills/taskmanager-crew/crew/. ~/crew/` and run `npm i playwright` there
(or point `NODE_PATH` at the repo's `node_modules`).

## The board and who moves what

Columns: Backlog, To do, In progress, **Verify**, **Ready for live**, **Done**, Bugs.

1. The PM puts ready tasks in To do, the rest in Backlog. A worker moves a task to In progress, builds it,
   tests it in the browser, attaches a screenshot, posts an update and moves it to **Verify**.
2. The PM pre-checks Verify (diff, lint, screenshot) and sends clearly wrong work back to To do.
3. **You review the code in Verify** (read the diff of the owned files, run lint and the typecheck,
   look at the screenshot, try it). Approved: move to **Ready for live**. Not approved: post written
   feedback on the task and move it to **To do**.
4. **Only you publish**, and only tasks in Ready for live. **Before merging ANY branch, merge the main
   branch into it and rerun everything on the result** (install, migrate on a scratch database, typecheck, lint,
   the full tests): a branch that was green on its own base goes stale in unexpected ways, and a clean textual
   merge can still break at compile time or at run time. That is the merger's job (yours), not the workers', and it is
   one command you run very often (`crew publish`, or your own script): squash onto a fresh main in a worktree on
   disk (never `/tmp`, a ramdisk), run the checks, stop on a conflict or a failure, then push and open the pull
   request. Then back up the database and apply any schema change (`SCHEMA CHANGED:` updates), merge, and move the
   tasks to **Done**.
5. Workers and the PM never commit, push, run `db:push`/`psql`/`drizzle-kit`, or touch the dev server.
6. Bugs: anyone files a `[BUG]` task in the Bugs column; the PM assigns it, a worker fixes it and moves it
   through Verify like anything else.

## Set up

1. The dev server and Postgres run from nix (see the repo README). The crew only needs the app on
   `http://localhost:3000`. Back up first: `pg_dump -Fc postgresql://arnotes:arnotes@localhost:5432/arnotes > ~/crew/backups/before-<what>-<date>.dump`. Never reset dev data: migrations are tested on real data.
2. Headless Chromium has no system fonts on this host and dies silently without
   `FONTCONFIG_FILE=~/crew/fonts.conf` (`tm.mjs` sets it). Edit the DejaVu path in `fonts.conf` to a
   font directory that exists on the machine (`ls /nix/store | grep dejavu`).
3. `node setup.mjs` (once: accounts, team, first project, API keys into `creds.json`), then
   `node setup-contact.mjs` (a read-only customer contact) and `node setup-scrapheap.mjs` (the customer
   and the development board). They need `PSQL=` and `CHROMIUM=` in the environment (nix store paths).
   Add the Ready for live column: `node tm.mjs boss api POST /api/projects/<id>/columns '{"name":"Ready for live","afterId":"<Verify id>"}'`.
4. Write the request in `BRIEF.md` in the customer's words (what and why, examples, "nothing is done
   until I have seen it work"), then `node postbrief.mjs` posts it as the umbrella task.
5. Chat line for meetings: start `chat-server-rs` (chat skill), join `#scrapheap` as `scrappy`
   (`chat-client-rs join`), keep a presence tail running (in session mode: `--no-session` stops it owning the socket) writing to
   `~/crew/chat-scrappy.log`, and run `guard.sh` as a tracked background task; its exit is the wake for
   an `@scrappy` mention (re-arm it every time). Use the newer client in `~/git/ai-skills/chat/bin/...`
   (a session-mode tail owns the socket, so sends do not show up as `scrappy-2`), or the `chat-mcp`
   bridge when it is registered. The chat is the phone line for meetings: problems, wishes,
   clarifications. The PM is the customer's contact and may bring developers along. **Ring, then talk
   in the chat**: wake the PM with a short session message (`SendMessage`, "ring ring: pick up in
   #scrapheap"), and the PM picks up by reading and answering in the channel. When the meeting is over
   someone says "meeting over: <decision>", everyone leaves, the PM copies decisions onto the board,
   and nobody polls the channel between meetings (each round starts with one read). Product questions go
   to the customer (chat `@scrappy` or a customer-visible task update), never to Boss; an internal
   note is invisible to the customer.

## Running rounds

A round is one fresh Haiku `Agent` (`model: haiku`) per person, started in the background, whose prompt
says: read `~/crew/CREW.md` in full, do ONE round, finish with at most 120 words. Order: PM round 1 (plan),
then the four workers in parallel, then PM, then workers again, and so on. Each hand-back wakes you. Read the
board (`node ~/crew/watch.mjs`), not the transcripts. Schema changes: a worker posts `SCHEMA CHANGED:`;
you back up and run `bun run db:push` (additive only), then tell the PM it is applied.

The log watcher is one Haiku agent that loops `WAIT=240 node ~/crew/watchlogs.mjs` and finishes with at most
150 words when it finds something that matters (not reload noise). Resume it with `SendMessage` after
each report; fix what it found.

## Rules the crew follows (full text in `crew/CREW.md`, edit it for the project)

- **Edit files with the `ai-text-editor` command**, never sed, redirects, heredocs or the Edit/Write
  tools (new files may be created with Write). You do the same: absolute paths, `search` then
  `replace --match-id` or `insert -o`, `save`. After `external_change`: `close --journal-action clean`, `open`, `read`.
- One task, one owner, named files; additive schema; lint before reporting; screenshot as evidence;
  honest reports; secrets never printed. A worker who works around a defect must say so, or file it.
- Long JSON bodies go through `tm.mjs ... '@file.json'`, not shell arguments.

## Pitfalls seen

- The dev server hot-reloads whenever anyone saves, and answers 503 for seconds; a blank page is not a bug
  until it repeats a minute later.
- Two modules in `server/utils` exporting the same name make Nitro warn on every rebuild; the watcher finds these.
- A review that only reads the PM's summary misses things: read the diff.
- Never put the tunnel's basic-auth credentials, VAPID keys, tokens or `creds.json` in a commit or a chat.
