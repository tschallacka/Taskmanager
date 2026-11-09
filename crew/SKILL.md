---
name: taskmanager-crew
description: Run a crew of cheap agents (Haiku unless the Owner picks another model per person) (a project manager, four workers, a usability tester, a code quality reviewer, each with its own browser profile) that build and test ANY product on a Taskmanager board, with Claude as the customer and code reviewer, an optional log watcher, and a chat line for meetings. Use when asked to "set up the crew", "have the haiku workers build X", "start a UX review", or to continue a crew run.
---

# Taskmanager crew

Haiku does the cheap work; Claude (you, "Boss") spends its budget only where judgement is needed: the
customer's request, answers to the PM, the code review, and the publish. The kit is project
agnostic: everything that belongs to one product lives in `crew.json` and
`PROJECT-RULES.md`. The kit is served by Taskmanager (`/crew/kit.tar.gz`, `/crew/SKILL.md`). Board tool details are in the `taskmanager` skill (`/api/settings/skill`); do not repeat them here. Run the kit with `crew <who> <command>`, `crew listen`, `crew watch`.

If the crew home (`$CREW_HOME`, or the kit folder when it is unset) is not set up yet, follow its `README.md` from step 1 and take the user through it.
Each crew has a home folder of its own, such as `~/crew-home/<crew slug>`. When your session was not
started with `CREW_HOME` set, prefix kit commands with it, as the commands in `PROMPTS.md` do.
If it is, run `crew watch` to see where the run stands.

## Cast

| key | who | job |
| --- | --- | --- |
| `boss` | the owner's login (you act through it, the crew never does) | applies schema changes, reviews code, publishes, reads reports |
| `customer` | the customer (you, in a second role) | asks for things, answers the PM, only sees customer-visible tasks |
| `pia` | the project manager (Haiku) | the customer's contact: plans tasks, answers questions, steers and starts the workers |
| `pat`, `tess`, `rita`, `janet`, `susy` | the pre-checker, the triage clerk, the reporter, the janitor, the poker (Haiku) | Pat pre-checks Verify PM; Tess triages findings and bugs; Rita writes the status and minutes; Janet cleans after a worker; Susy pokes people who stopped |
| `wren` `wick` `wynn` `wade` | the workers (Haiku) | build, test in their own browser profile, report |
| `usher` | Usher Xander, the usability tester (Haiku) | reviews a task in `Verify UX`, tries every feature, files `[UX]` findings for the PM |
| `nina` | Nina Nitpick, the code quality reviewer (Haiku) | reviews a task in `Verify CQ`, files `CQ violation` subtasks, tags `CQ approved` |
| `quincy` | Quincy Average, QA (Haiku) | uses a task in `Verify QA` like a customer or a blind agent, files `QA violation` subtasks, tags `QA approved` |
| `contact` | a read-only customer contact | lets anyone check what a customer sees |
| log watcher (Haiku) | no login | reads the dev log, crew transcripts and new bugs; flags problems to you |

## The board and who moves what

Columns: Backlog, To do, In progress, **Verify PM**, **Verify UX**, **Verify CQ**, **Verify QA**, **Verify**, **Ready for live**, **Done**, **Blocked**, Bugs.

1. The PM puts ready tasks in To do, the rest in Backlog. A worker moves a task to In progress,
   builds it, tests it in the browser, attaches a screenshot, runs the tests (none may fail), posts an
   update and moves it to **Verify PM**.
2. Pat (`pat`) pre-checks it in **Verify PM** (diff, lint, evidence, time log) and sends clearly wrong work back
   to To do. Then the server routes it through the gates on a crew board, each owned by one person, and returns to **Verify PM** after
   each: **Verify UX** (the usher, only when a subtask is tagged `verify UX`), **Verify CQ** (the
   nitpicker) and **Verify QA** (Quincy). Each reviewer files problems as subtasks (`UX violation`,
   `CQ violation`, `QA violation`) and tags the task `UX approved`, `CQ approved` or `QA approved`
   when nothing is left. Only then does the PM move it to **Verify** for you:
   worker -> PM -> usher -> nina -> Quincy -> PM -> you. The tags are listed in `CREW.md` rule 7b.
3. **You review the code in Verify**: read the diff of the owned files (do not trust the summary),
   run lint and the typecheck, look at the screenshot, **try it yourself** in a browser. Approved:
   move to **Ready for live**, which hands the work to the user. Not approved: post written feedback as subtasks tagged `Feedback Cato`,
   assign the task to the PM and move it to **Backlog**. Be critical: send work back when it is not up to standard.
4. **Only you publish**, and only tasks in Ready for live, following the release steps in
   `PROJECT-RULES.md` (merge the main branch into the branch and rerun everything on the merged tree, backup, schema
   change, merge the task's pull request). Before merging ANY branch, merge the main branch into it and rerun
   install, migrate (scratch database only), typecheck, lint and the full tests on the result: things go stale in
   unexpected ways fast, and a clean textual merge can still break. That is the merger's job (yours, not the
   workers') and it is one command you run often. Keep its worktrees and logs on disk, never in `/tmp` (a ramdisk
   that a reboot wipes). Move a task to **Done**
   when everything is wrapped up and the crew does not need to act on it anymore: it is published or
   accepted by the user, and no subtask, question or follow-up is open.
5. Workers commit and push only their own branch, one pull request per main task (`WORKFLOW.md`, Phase 3).
   Only you merge. The PM and the reviewers never commit or push, and nobody but you touches the database.
6. Bugs: anyone files a `[BUG]` task in the Bugs column; Tess triages it and assigns it, a worker fixes it and
   moves it through Verify like anything else.
7. UX review: the tester files `[UX]` findings; Tess triages them. Pia answers their questions, and unclear product
   points become a chat meeting with you.

## Running it

- **Janet cleans up after a worker, and only when asked.** The card gets `ready to clean`, and Pia or Susy start her.
  She makes the plan with `crew janet clean plan` (it deletes nothing), and deletes only after the checker sets
  `cleaning granted` on the plan subtask: `crew janet clean run`. The rules and the tags are in `JANET.md`.
- **Start Pia, and only Pia.** She needs her own Claude Code session (a subagent cannot start other agents), so
  start it in a real terminal with the `interactive-shell` skill, as `$CREW_HOME/PROMPTS.md` says under "Starting
  Pia", and send her prompt as her first message. Pia starts the workers, the reviewers and the log watcher herself
  with the prompts in that file (`Agent`, `subagent_type` from the table at its top, `model` from the same table,
  `run_in_background: true`). You do not start them, do not watch them and are not the go-between for their
  messages. Each member is its own agent type (`init.mjs` writes them). On "Agent type not found", restart Claude
  Code (`claude --continue`): never start a member without its `subagent_type`.
- **Check on Pia.** At the start of every turn read the board (`crew watch`), not the transcripts. When Pia is
  unavailable (her session ended, or a task assigned to her had no update, move or tag from her for two of your
  wake-ups), start her again the same way. Pia does the same for a worker or reviewer who is unavailable.
- **Watch for `@cato`, every minute.** Pia asks Boss things by writing `@cato` in a task update. Only Pia does: the
  workers and reviewers ask Pia, and Pia decides what goes to Boss, so a `@cato` from anyone else is ignored. Boss
  is not a board member, so no notification reaches this session. At the start of a crew session, start
  `crew boss-mentions` as a `Monitor` (timeout 30 minutes, the most it allows). It checks the boards every 60 seconds
  and prints one line per new @cato mention by Pia, Susy or Rita, and each line wakes you. Re-arm it every time it
  expires, for as long as the crew runs. Start `crew watch-crew` as a second `Monitor` the same way: it checks Pia
  (her session, her transcript, her own listener) and Susy every 3 minutes and prints only on trouble, and once when
  it is fixed. Both are the Boss watches of the kit. A Stop hook in your session (`boss-stop-hook.sh`, written by
  `init` into the folder `bossSession` in crew.json) blocks you from ending a turn while one of them is not running,
  and names the Monitor call to make: it is the safety net, not the plan. `init` removes only Stop hooks whose command contains `boss-stop-hook.sh`; a crew's own trial entry (for example `bin/boss-watch-hook.sh`) stays until Boss removes it by hand, and until then two Stop hooks run. Answer a mention before anything else except
  the Owner. After a restart, run `crew mentions` once: it catches up from its last check (the first time, the last 24
  hours). The watch reads updates on main cards only, so tell Pia to put a question for you on the main card, not on a
  subtask.
- **Chat line.** Start the chat server, join the customer channel as the customer nick, keep a
  presence tail running and arm `guard.sh` as a tracked background task; its exit is the wake for
  an `@<customer nick>` mention. Re-arm it every time. The chat line is optional (off unless `chat.client` is set): without it, meetings and steering go through the board. See `README.md`.
  Ring, then talk: wake the PM with a short session message, and the PM picks up in the channel.
- **Schema changes:** a worker posts `SCHEMA CHANGED:`; you back up, apply it (additive only),
  and tell the PM it is applied.
- **The customer's decisions are the user's.** Product questions go to the customer (chat or a
  customer-visible task update), never to Boss; an internal note is invisible to the customer.

## Rules for you

- Read the diff, not the summary. Run the checks yourself. Try the feature in a browser at desktop
  and at phone width (390x740).
- Never put the board's credentials, API keys, passwords or `creds.json` in a commit, a gist or a chat.
- Do not mark a task Done before the push.
- When the user has said who does what ("the crew builds, you review"), do not do the crew's work
  yourself; if you fix something small, say so and still have it reviewed.

## Pitfalls seen

- The dev server hot-reloads whenever anyone saves, and answers 503 for seconds; a blank page is
  not a bug until it repeats a minute later.
- A fresh worker's first `listen.mjs` run reads the whole channel history, and an old "standing
  down" line makes it stop at once. The launch prompts say history is old; if one stops anyway,
  post a correction in the work channel and resume it.
- A stale script re-run by an agent creates duplicate tasks. Check the board before re-running
  anything.
- A review that only reads the PM's summary misses things: read the diff.
- Two modules exporting the same name make some bundlers warn on every rebuild; the log watcher finds these.
