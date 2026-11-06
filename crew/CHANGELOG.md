# Changelog

## Unreleased

- **`crew.mjs idle`.** Prints each free worker of the crew board with the Backlog cards they may start, and the first startable cards. Reads `crew_activity`, changes nothing. `crew/idle.mjs`, listed in `kit-files.txt`, tests in `crew/kit.test.mjs`. `WORKFLOW.md` section 5 and Pia's prompt in `PROMPTS.md.tmpl` run it before the inbox on every wake-up.

- **Boss watches for `@cato` every minute.** Pia asks Boss things by writing `@cato` (or `@boss`) in a task update; the rest of the crew asks Pia. Boss is not a board member, so no notification reached the Owner's session, and on 2026-11-05 Pia's questions waited about a day. New: `mentions.mjs` (in `kit-files.txt`). `crew mentions` checks once and prints what came in since its last check (the first time, the last 24 hours), `crew mentions <minutes>` looks back that far, and `crew mentions --follow` checks every 60 seconds and prints one line per new mention. A card is read again when its update count changed, because posting an update does not change a card's `updatedAt`, and `get_task` is asked for every update since the last check rather than the newest five. Each mention is printed once: the printed ids, the last check and the update counts are kept in `CREW_HOME/.listen/boss-mentions.json`, and they change only when a check completes, so a failed check loses nothing. Only Pia's updates count: the workers and reviewers ask Pia, and Pia decides what goes to Boss, so a `@cato` from a worker, a reviewer or Boss itself is ignored, and so is an address such as `x@cato.nl`. It uses `TASKMANAGER_API_KEY` (the Owner's key), and falls back to the crew's boss account. A JSON-RPC or tool error is an error, never an empty board. A board the key cannot open is dropped with one line. A failed check is reported once, and again when the board answers. `SKILL.md` ("Running it") and the Boss instructions the server sends (`server/utils/crewBossSkill.ts`, "Check your tasks regularly") tell Boss to run it as a `Monitor` from the start of a crew session and re-arm it whenever it expires, or, with no `Monitor`, to schedule `crew mentions` every minute. Tests in `kit.test.mjs`, section "crew mentions".
- **`crew update` brings an existing crew home up to date.** `update.mjs` (new, in `kit-files.txt`) fetches the kit the board serves, or takes `--from <folder or kit.tar.gz>`, and compares it with the kit folder. `--check` reports and writes nothing; an up-to-date kit changes nothing. Otherwise the kit files that differ are backed up to `CREW_HOME/backups/update-<time>/kit`, the files the new kit no longer ships are removed, and the new kit's own `update.mjs` finishes: the owner files `PROJECT-RULES.md` and `BRIEF.md` are merged three-way (`init.mjs` now keeps the template they came from in `CREW_HOME/kit-base`; a file with no record is kept and the new template set aside), the skill copies are refreshed only where they still match the old kit, `init` renders the documents, and the install is recorded in `CREW_HOME/crew-kit.json` with a hash per file. A kit file that was edited by hand is saved in the backup before it is replaced. Lines about the Taskmanager server in the new changelog are listed, never made. `crew.mjs` routes `update`; `update` is no longer a usable person key. `kit.test.mjs` has a section "crew update" that covers no-op, check, install with merge and removal, conflict, no recorded template, a second merge after that, a kit without `update.mjs`, the board fetch with removals from the record of the last install, a file the kit does not ship (folder and archive), skill copies, and the failed copy. A board update takes its removals from `crew-kit.json` (or the `kit-files.txt` a crew came with, until its first update), since the board's archive does not carry the list.
- **Git rules agree with the workflow.** Workers now work in their own git worktree and branch, and commit and push only that branch, one pull request per main task, as `WORKFLOW.md` Phase 3 says. Only Boss merges. The PM and the reviewers stay on read-only `git status` and `git diff`, and the database stays Boss's. Changed: the worker prompt in `PROMPTS.md.tmpl` (it said "Never run git", and it now hands work to Verify PM rather than Verify), `CREW.md.tmpl` rule 2, `SKILL.md` (item 5 and the release step) and the release step in `PROJECT-RULES.md.tmpl`. `init` never overwrites a crew home's existing `PROJECT-RULES.md`, and a later `crew update` merges its template changes into it. The first update of a crew made before `kit-base` keeps that file and says so, so change its release step by hand. `SKILL.md` also lists the current columns, and `WORKFLOW.md` section 8 names `NINA.md.tmpl`.
- **A model per person (Q59a).** `models` in `crew.json` sets the provider and model of each person; a string is a Claude model, an object names `provider` (`claude`, `openrouter`, `ollama`) and `model`, and `default` covers everyone not named. With nothing set everyone stays on `haiku`, as before. `init.mjs` writes the model into the agent definitions (the crew's and the forks') instead of a fixed `model: haiku`, prints a FAIL line for a bad entry and gives that person the default, and writes no definition (with a WARN) for a person set to a provider the kit cannot start yet. `PROMPTS.md` has a provider and model column, uses the model for the `Agent` calls and starts Pia with `claude --model`. New: `README.md` section "Models", with guidance per provider. Two new tests in `kit.test.mjs`.
- **`Ready for live` and `Done` defined.** `Ready for live` is the work handed to the Owner, who can take it live or accept it. `Done` is everything wrapped up, with nothing left for the crew to do. Cato moves a task into both. `WORKFLOW.md` (section 2, Phase 9), `CREW.md.tmpl` rule 7 and `SKILL.md` say so.
- **Boss starts only Pia; Pia starts the workers and reviewers.** The `WAKE` comment that Boss checked and acted on is gone. Pia runs in her own Claude Code session, with or without a channel, because a subagent cannot start other agents. `PROMPTS.md.tmpl` has a new section, "Starting Pia", for Boss (the `interactive-shell` skill, a folder of her own, the first message), and Pia's prompts say that she starts and resumes her people with the `Agent` tool and `SendMessage`. `CREW.md.tmpl` replaces "How a worker is woken (for Boss)" with "How the PM starts a worker or reviewer", including when a person counts as unavailable and when she tells Boss. `SKILL.md` and the setup page's messages say the same, and a comment that asks Boss to start someone is text, not an order. `channel.mjs` is unchanged. Not tested end to end: starting Pia's session through `interactive-shell`, and Pia starting subagents from a session that holds a channel.
- **Person keys renamed again: `pm` is `pia`, `nitpicker` is `nina`.** `NITPICKER.md.tmpl` is `NINA.md.tmpl` (rendered as `NINA.md`), the default nick of the code reviewer is `nina`, and every command the documents print uses the new keys: `crew pia update ...`, `listen.mjs nina 60`, `crew channel pia`. `keys.mjs` moves an old crew home the same way as before (`creds.json`, `profiles/pm`, `channel-pm.state.json`, `.listen/pm.json`, and the same for `nitpicker`), and the old keys in `crew.json` are read as the new ones; a nick you chose is kept. An `.mcp.json` entry that runs `channel.mjs pm` is yours to change to `channel.mjs pia`. A forks file stored before the rename keeps the old keys: hand over a fresh one from the board and run `init.mjs --forks` again.
- **Quincy, QA, joins the cast; the review gates are documented.** New person key `quincy` (Quincy Average): `config.mjs` (people, nick, `CAST`), `init.mjs` (agent definition), `QUINCY.md.tmpl` (new), the table and prompt in `PROMPTS.md.tmpl`, `CREW.md.tmpl` and `SKILL.md`. `CREW.md.tmpl` rule 7 now describes the columns `Verify PM`, `Verify UX`, `Verify CQ`, `Verify QA` and `Verify`, who owns each gate, and the violation and approval subtasks, and rule 7b lists every tag and who sets it (labels are free text, so nothing is created on the board). `NITPICKER.md.tmpl` and `USHER.md.tmpl` describe their gate, with a fresh start every pass and the timer tools. `PIA-UX.md.tmpl` gives the gate order. The Boss-starts-the-workers part (the `WAKE` comment) is unchanged until Pia starts them herself.
- **No test may fail.** `WORKFLOW.md` has a new hard rule (9), a `test failing` tag, time-boxes (30 minutes for whoever sees the failure, 15 for Pia, 30 for Cato) and a section, "A failing test nobody can explain": the worker or reviewer tags the task and moves it to Blocked, Pia raises it with Cato when she cannot explain it either, and Cato tells the Owner when he cannot. The same rule is in the worker, PM, usher and nitpicker prompts (`PROMPTS.md.tmpl`), in `CREW.md.tmpl` (rule 6b and the PM's job), and in `PROJECT-RULES.md.tmpl`. A task whose test output shows a failure goes back to its worker. `kit.test.mjs` no longer counts an npm `package-lock.json` as a kit file that must be listed.
- **Person keys renamed.** The workers' keys `w1` to `w4` are now `wren`, `wick`, `wynn` and `wade`, and the usability tester's `pietje` is `usher` (`PIETJE.md.tmpl` is `USHER.md.tmpl`). A crew home made before the rename is moved on the first run: `keys.mjs` (new) renames the keys in `creds.json` (mode kept at 600), the old keys in the `people` and `nicks` of `crew.json` are read as the new ones, and `profiles/<key>`, `channel-<key>.state.json` and `.listen/<key>.json` are renamed, never over a file that already exists. Commands take the new keys: `crew wren mcp my_tasks '{}'`. `crew/keys.test.mjs` covers it. The board does its half when it starts (account addresses, key names and fork rows).
- **Forks.** `init.mjs --forks <file>` takes the file the board hands over under **Fork the crew for this board** (`forks-<crew>-<board>.json`), stores it in `CREW_HOME/forks` (owner only, since it holds passwords and keys) and writes one Haiku agent definition per fork, named for the board and the person (`internal-tools-wren`). A fork signs in as that name: `crew internal-tools-wren mcp get_board`. `config.mjs` gains `loadForks()`, and `loadCreds()` adds every fork as a person, so `tm.mjs`, `listen.mjs` and the browser work with it unchanged. A file that is not a forks file is refused, and a broken one in the folder is left out without stopping the rest. `crew/kit.test.mjs` covers all three.
- **`crew <who> browser goto|shot|eval|console|tabs|close-tab|done` and `crew browser status|shutdown`** (GH #71). One headless Chromium for the crew, started by the first command and stopped when unused. One browser context per person, each signed in with that person's own login from `creds.json` (nothing about the login is stored on disk). Named tabs (at most 8 a person), a width kept per tab, idle cleanup, dialogs dismissed unless asked, no TCP port. A browser crash is announced in the next reply, and the person is signed in again. `browser-driver.mjs` is the driver and `browser.mjs` the command.
- **Driver hardening.** A lock takeover no longer puts a lock back by a hard link: a live lock that a takeover caught is taken again by its owner, and a claim checks the socket after it creates a lock. The state folder is opened without following links and its descriptor is kept. The system temp folder is a screenshot root only when `CREW_BROWSER_SHOT_DIRS` names it.
- **Docs and tests.** `CREW.md.tmpl` and `PROMPTS.md.tmpl` say when to use `browser` and when `run`. `README.md` has the settings and the limits. `kit-files.txt` lists the new files. `crew/kit.test.mjs` checks that list and runs the command end to end against a fake board and a real Chromium (skipped without one).

## 2026-11-03: the unblocked event and Inbox note (GH #36 slice 5)

- **`server/utils/unblockedWatch.ts`.** New. When the last open blocker of a task finishes (its column is finished, it is completed, or it is trashed), the assignee gets an Inbox note and the `unblocked` agent event, and the crew's pm gets the event. A dependent is told only when it was blocked before the change. Coalesced per board and recipient, like task moves.
- **`server/utils/agentEvents.ts`: `unblocked`.** A new kind. Nothing else changes.
- **`crew/channel.mjs`, `crew/CREW.md.tmpl`, `crew/PROMPTS.md.tmpl`, `crew/README.md`.** One line each for the kind.

## 2026-11-02: the PM side of failed GitHub deliveries (GH6c)

- **`server/utils/agentEvents.ts`: `delivery_failed`.** The crew's pm hears one event for each delivery that gives up for good, when its row is new (a retried row that fails again is not announced again). The frame carries ids only: the event, the repository, the class, the attempts and a short code. Never the reason text or the payload. A team that is not a crew gets it for its owners. It is not a GitHub-card kind, and nothing else hears it.
- **`server/utils/githubDeliveryConsumer.ts`.** Announces the row after it is written, without waiting for it. A failure to announce is logged and never changes the failed path.
- **`server/utils/githubDeliveryFailures.ts`.** The PM's reads and actions: list and count per repository, the metadata of one delivery with a short payload preview, retry and discard with the outcome in words ('retried', 'already retried', 'payload expired', 'not failed', 'claim expired — retried again'), and the queue status. A key sees only the repositories linked to projects its team works on; any other delivery is refused with one message.
- **`server/utils/mcpBoardTools.ts`, `server/utils/agentAudit.ts`.** Five staff tools: `list_failed_deliveries` and `get_failed_delivery` (boards:read), `retry_failed_delivery` and `discard_failed_delivery` (boards:write, for the crew's pm key only; the discard reason 3 to 300 characters), and `github_queue_status` (boards:read; the broker address is never shown). Each retry or discard, and each refusal of those, is in the agent audit with the delivery id and the outcome; so is one delivery read with `get_failed_delivery`. List and status are not audited.
- **`crew/channel.mjs`.** Forwards `delivery_failed` to the PM only (`is_pm`), with an instruction line.
- **Docs and skill text.** `crew/README.md`, `crew/CREW.md.tmpl`, `crew/PROMPTS.md.tmpl` say what the PM does on it; the served taskmanager skill has a GitHub deliveries group; the root README's queue section no longer says the tools are to come.
- **Tests.** `tests/github-delivery-failures.test.ts` (each tool for staff, a customer contact, another team and a read-only key; the audience of the event; exactly-once retry and discard; no payload in lists, audit or events; the status without the broker address) and additions to `tests/agent-events.test.ts`.

## 2026-11-02: an update from a file, no JSON escaping (GH #40)

- **`crew <key> update <taskId> <file|->`** (`tm.mjs`). Posts a Markdown file, or stdin for `-`, as one task update through `post_task_update`. A staff update is internal unless `--customer` is given. An empty body is refused (exit 65), a file over 200 KB is refused (exit 65) and a missing file gives a plain error (exit 66). Unknown flags and extra arguments are usage errors (64), and so is a terminal on stdin. Invalid UTF-8 or NUL bytes are refused (65), a symlink or a non-file is refused (66), and an unreachable board exits 69. The file is read in chunks and stops at the limit. It prints `posted as internal` or `posted as customer`; a customer contact is always customer-visible. It runs without starting a browser.
- **`crew <key> attach`** is unchanged in behaviour. A missing image is refused before a browser starts (exit 66).
- **`CREW.md.tmpl`, `PROMPTS.md.tmpl`, `README.md`.** The file form is the default for any update longer than one line, and the inline JSON form is the exception. The tool section now runs `crew.mjs` through `{{kit_dir}}`.
- **`tests/crew-update.test.ts`.** Runs the subcommand against a fake local board: bodies from a file and from stdin come through byte-exact, the visibility flags, the refusals and exit codes, and a check that the documents show the file form.

## 2026-11-02: GitHub events for the crew (GH4)

- **`server/utils/agentEvents.ts`: four GitHub kinds.** `pipeline_failed`, `pipeline_passed`, `merged_staging` and
  `merged_production`, with origin `github` and a `ref` (the pull request number and branch, cut to 60 characters).
  They reach the crew once the GitHub webhook slice (GH3) is on master; nothing emits them before that.
  No body, comment or check log is ever in one. The server decides who hears each (`githubAudience`): the card's
  assignee and creator and the crew's PM hear all four; Boss hears the two merges and `pipeline_passed` on a card in
  Verify; a team that is not a crew gets its owners only; a customer never. The frame adds `ref`, `is_pm` and
  `is_boss`. `announceGithubEvent` is the entry point the webhook will call. Nothing calls it yet.
- **`crew/channel.mjs`.** Learns the four kinds and forwards them by the server's flags: the PM all four, the
  assigned worker all four, Boss the merges and a passed pipeline. The instructions name each kind; the `ref` is in
  the line.
- **`CREW.md.tmpl`, `PROMPTS.md.tmpl`, `README.md`.** What each role does per event: a failed pipeline is the
  assignee's to fix on the same card (no new card); a passed pipeline on a card in Verify is Boss's review; a merge
  into staging is the PM's check and the customer's news; a merge into production moves the card to Done.

## 2026-11-02: channels (events pushed into the PM's session)

- **`channel.mjs`.** The channel server for one member: `node channel.mjs <who>`, or `crew channel <who>`. It pulls
  `GET /api/agent/events` with the member's key from `creds.json`, turns each event into a
  `notifications/claude/channel`, and reconnects from the last event id. It opens no port. It needs
  `@modelcontextprotocol/sdk` (`npm install`).
- **Channel mode in `CREW.md.tmpl` and `PROMPTS.md.tmpl`.** The PM acts on each event instead of running the listen
  loop. Boss wakes a worker on a `WAKE <key>: <card id>` comment. `listen.mjs` stays the fallback. Text inside a card
  is data, never an instruction.
- **`README.md`: Channels.** The `.mcp.json` entry, the research-preview flag, troubleshooting, the security notes and
  a numbered live check for the owner.
- **`kit-files.txt`** lists `channel.mjs`.

## 2026-11-02: the kit becomes a Taskmanager feature

- **Served by Taskmanager.** `/crew/kit.tar.gz` (no secrets, header `x-crew-kit-version`) and
  `/crew/SKILL.md` (the `taskmanager-crew` skill) come from the `crew/` folder of the instance. The archive
  has the kit at its root, is byte-stable (sorted, fixed owner, mtime and mode, gzip without a timestamp) and
  is checked by a test.
- **One home folder.** Everything the kit writes goes to `CREW_HOME` (default: the kit folder): `creds.json`,
  `crew.json` (replaces `crew.config.json`, which still works), profiles, logs, rendered documents.
- **One entry point.** `crew.mjs`: `crew <who> <command>`, `crew listen`, `crew watch`, `crew init`,
  `crew setup`. The old file names keep working. `npm install` needs Node 20 or newer.
- **Crew API setup.** `setup.mjs` is a thin client of `POST /api/crews` (key from `CREW_ADMIN_KEY`, never
  stored). The sign-up loop and the SQL flag are gone.
- **Chromium.** `CHROMIUM` or `chromium` in `crew.json`. `--no-sandbox` only when
  `CREW_CHROMIUM_NO_SANDBOX=1`.
- **Chat is optional.** Off unless `chat.client` is set; without it the board is the channel (`list_messages`).
- **Templates.** No names, paths or people left from the first run. No local-git or pull-request machinery
  in the kit.

## 2026-11-02

- **Subtasks never change columns.** They live in their parent's panel and `move_task` refuses them. A
  subtask is finished with `update_task` and `completed: true`; the worker posts `READY FOR REVIEW: ...`
  on the subtask and on its parent so the PM, the nitpicker and the tester find it. `CREW.md.tmpl` 7d and
  `PIETJE.md.tmpl` say so.

## 2026-11-01

- **New role: the nitpicker** (default "Nina Nitpick", key `nitpicker`). A code quality reviewer: she
  reads the diff of the owned files of each task in Verify (read-only `git diff` / `git status`), checks
  duplication, structure, neighbours, sanity and size, and posts `NITPICKER: approved` or
  `NITPICKER: changes needed` as an internal task update. New `NITPICKER.md.tmpl`, config defaults
  (`people.nitpicker`, `nicks.nitpicker`), account, team join and API key in `setup.mjs`, a launch prompt in
  `PROMPTS.md.tmpl`.
- **Reproducible steps.** Every finding, retest and bug carries a numbered "Steps to reproduce"
  section. The PM answers a finding without steps with `QUESTION: steps please`.
- **Tester retests.** The tester retests every changed UX item (`RETEST: pass|fail`, numbered steps,
  screenshot) and takes `[UX check]` subtasks from the coders.
- **Card lifecycle.** The finding card is the work item (no copy): the PM comments the plan, assigns the
  worker and moves it to To do. A finding card never sits in Backlog while its fix is Done. Order in
  Verify: worker, nitpicker, tester, Boss.
- **Subtasks** (`create_task` with `parent`) for findings that touch several steps or screens. Needs a
  Taskmanager version whose `create_task` accepts `parent`; without it the card description carries the
  checklist.
- **Time logging.** Workers, the nitpicker and the tester log time with `log_time` on the task or subtask
  they worked on, rounded up to 5 minutes; Verify needs a time log.

## Older entries

Earlier versions of the kit (PM, four workers, tester, log watcher, chat line) were not tracked here.
