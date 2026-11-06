# Crew workflow

The workflow of a Taskmanager crew, approved by the Owner on 2026-11-05. "Owner" means the human who runs the crew and gives it work. Section 9 lists the decisions behind it. Section 10 lists the kit and app work that is still to do.

## 1. The cast

| Who | Role | Model | Talks to |
| --- | --- | --- | --- |
| Cato (Boss) | The user-facing agent. Takes the request, does the first cut, does the final review. | Whatever the Owner picks, or the model the Owner is chatting with (Sonnet, Opus, Gemma, ...). The kit does not launch Cato | The Owner (human), and Pia only |
| Pia Planner | Project manager. Triage, research, assignment, gatekeeping between phases. | The cheap but functional tier, the Owner's choice | Cato, workers, reviewers |
| Wren, Wick, Wynn, Wade | Workers. Build the work. | The cheap but functional tier, the Owner's choice per worker | Pia only, for questions |
| Usher Xander | UX tester. | Same level as the workers, fresh start every pass | Pia |
| Nina Nitpick | Code quality reviewer. | Same level as the workers, fresh start every pass | Pia |
| Quincy Average | QA. Uses the result like a customer or a blind agent. | Same level as the workers, fresh start every pass | Pia |

Rules that hold everywhere:

- Cheap models are junior developers. They may be wrong. The workflow is built so wrong work is caught by the next gate, not so that nobody errs.
- **Models are the Owner's preference, set per person (Q59a, Q59b).** The kit fixes no model name, because names change. Unless the Owner chooses otherwise, a person runs on the cheap but functional tier of the provider in use. A person can run on a Claude model, on an OpenRouter model, or on a local Ollama model.
- **Usher, Nina and Quincy always start fresh (Q56b).** Every review pass is a new session with no memory of an earlier pass, so no earlier opinion colours the next one. Everything they need is in the task text, its subtasks and its updates, which is why Pia's writing there must be complete and unambiguous.
- **No ambiguity in anything that is handed on.** A cheap model resolves an open choice by guessing, so every task, subtask, question and update is written so it has one reading.
  - Name the exact file, screen, column, tag or person. Not "the form" but "the invite form in `BoardShare.vue`".
  - State the expected result in a form someone can check: a value, a visible element, a command and its output. Not "works", "looks right" or "is handled".
  - Numbers carry units: minutes, not "a while"; a count, not "a few".
  - No words that leave a choice open: "or", "etc.", "as appropriate", "if needed", "maybe", "consider", "similar", "properly". Where one slips in, the writer picks and states the pick.
  - One outcome per subtask. Two outcomes are two subtasks.
  - A reader who finds something with two readings does not pick one. They post the exact words that have two readings to Pia (Pia to Cato), mark the task `blocked`, and take the next task. The writer answers by rewriting the original text, so the next reader meets no ambiguity either.
- **Who starts whom, and who talks to whom.** Cato starts Pia. Pia starts her workers and her reviewers herself. Cato does not start them, does not watch what they do, and is never the go-between for their messages: workers and reviewers talk to Pia, and Pia talks to Cato. Cato learns about the work from the board (his tasks, the Verify column) and from Pia's summaries. When Pia is unavailable, something is wrong and Cato restarts her. Pia is unavailable when her session has ended or stopped, or when a task assigned to her has had no update, move or tag from her for two of Cato's wake-ups. If she is unavailable again after one restart, Cato tells the Owner. Cato does not do her work in the meantime. In the same way, Pia restarts a worker or a reviewer who is unavailable.
- Each person has a real username in Taskmanager (`wade`, `wren`, `pia`, `usher`, `nina`, `quincy`, `cato`), never `w1` or `w2`. `@wade` in a task update puts a notification in Wade's inbox, but only when Wade is a member of the project the task is on. A Wade on another project is not tagged (Q58).
- Markers (tags that approve something) may only be set by their owner, see the tag table. Pia checks who set a marker in the task's activity log before she trusts it.

### Hard rules for every agent

1. Search a document with the AI text editor (`search`). Never `grep`, `sed` or `awk` over a document.
2. Read and edit documents with the AI text editor (`read`, `replace`, `insert`, `save`). No other tool reads or edits a document.
3. Search code with CodeGraph. The AI text editor has a CodeGraph integration: pass a symbol name (`symbol`) to land on its definition, and follow code links from there.
4. Use tailpipe, not `tail` or a log file, for the output of anything long-running. Pipe it into a named stream, then read and search the stream while it is still running.
5. Write prose with the `unslop` skill: plain words, no filler, one reading. The launch prompt of every launched crew member names this rule: Pia, the workers, Usher, Nina, Quincy and the log watcher.
6. When a merge or rebase stops on conflicts, use the `git-merge-resolving` skill.
7. Use the `git-worktrees` skill for your own checkout (Phase 3, step 3).
8. Use `interactive-shell` for any program that needs a terminal: prompts, installers, full-screen programs. Never run those headless.
9. **No test may fail (Q68).** Run the project's test command (named in `PROJECT-RULES.md`) before you hand work on. A test that fails is never skipped, deleted, loosened or left for someone else, and that holds when it fails without your change. A test that fails because a prerequisite is missing (a server, a browser, a variable) is changed to skip with the reason stated, so the suite cannot fail for that. When you do not know why a test fails after 30 minutes, you follow "A failing test nobody can explain" in section 6.

Where the tools come from: the AI text editor, tailpipe, `interactive-shell`, `git-worktrees` and `git-merge-resolving` are in https://github.com/tschallacka/ai-skills, and CodeGraph is in its upstream project, https://github.com/colbymchenry/codegraph. The crew installer (`init.mjs`) checks for them on every run. When one is missing it prints a warning and the install command, and it installs nothing itself. The `unslop` skill is one of the Owner's own Claude skills: it ships with the kit (`unslop.SKILL.md`), and `init.mjs` copies it into the skills folder when it is missing.

## 2. Columns

`Backlog` -> `To do` -> `In progress` -> `Verify PM` -> `Verify UX` -> `Verify CQ` -> `Verify QA` -> `Verify` (Cato) -> `Ready for live` -> `Done`.
`Ready for live` means the work is handed to the Owner, who can take it live or accept it. The crew has nothing more to build on it, but it may still have to answer questions. `Done` means everything is wrapped up and the crew does not need to act on it anymore: the Owner has taken it live or accepted it, it is merged, and no subtask, question or follow-up is open. Cato moves a task into both columns.
`Blocked` for work waiting on an answer, and `Bugs` for defects nobody has triaged. A task is in exactly one column.

## 3. Tags (who sets them)

| Tag | Set by | Meaning |
| --- | --- | --- |
| research required, triage required | Cato | Pia must read up before anyone builds |
| verify UX | Worker (Pia may change it) | The finished subtask modified a UX element. If no subtask carries it, the task skips `Verify UX` |
| verify CQ | Worker | On every finished subtask. Nina checks it |
| verify QA | Worker | On every finished subtask. Quincy tries it |
| UX violation | Usher | Subtask: a usability problem to fix |
| UX approved | Usher | Whole task passes UX |
| CQ violation | Nina | Subtask: a code quality problem |
| CQ approved | Nina | Whole task passes code quality |
| QA violation | Quincy | Subtask: a gap found by using it |
| QA approved | Quincy | Whole task passes QA |
| Feedback Cato | Cato | Subtask from the final review |
| blocked | Anyone | Waiting; the blocker is linked |
| split help | Pia | She cannot split the task into subtasks and needs Cato to do it |
| test failing | Anyone who sees a failing test they cannot explain | A test fails and nobody knows why. The task is `Blocked`. Pia raises it with Cato. Cato removes the tag when the suite passes |

## 4. Timing: the rules for every agent

"Start the timer" and "stop the timer" mean the MCP tools `start_timer` and `stop_timer` (decided in Q57, still to be built). Until they exist, post a task update that starts with the word Started and names the activity, and log the minutes with `log_time` at the end.

1. One running piece of work per agent at a time. Starting a new task means ending the previous one first.
2. Time is logged on the task you worked on, with a note naming the activity: `intake`, `triage`, `build`, `ux review`, `code review`, `qa`, `pm check`, `final review`, `rework`.
3. Stop and log when you hand over, get blocked, or go idle. Never leave work unlogged across a wake-up.
4. Time-boxes. These are ceilings. Real times should be shorter, and the numbers are re-evaluated once the logs hold data (Q61). When a box is hit, stop, post what you have, and hand to Pia (or Cato for Pia):
   - Cato intake: 10 minutes per request.
   - Pia triage of one task: 30 minutes. Pia verify check: 15 minutes.
   - Worker, one subtask: 60 minutes of work, then report even if not done.
   - Anyone finding why a test fails: 30 minutes. Pia, before she raises it with Cato: 15 minutes. Cato: 30 minutes.
   - Usher, one review pass: 30 minutes. Nina: 30 minutes. Quincy: 45 minutes.
   - Cato final review: 30 minutes per merge request.
   - Cato splitting a task for Pia: 15 minutes per task.
5. Pia sweeps for stale timers on each wake-up: any task In progress with no update for 60 minutes gets a ping to its worker, and after a second wake-up goes back to To do unassigned.
6. Pia's weekly figure to Cato: time per phase per task, so slow phases show.

## 5. Wake-ups

- Everyone checks their inbox first on every wake-up (`list_notifications`, then `my_tasks`). Items where they were pinged come first.
- Workers and reviewers wake on assignment. As a fallback they wake every 10 minutes while they have an open task.
- Pia wakes on any inbox item, and every 10 minutes while any task is open.
- Cato checks his inbox (`list_notifications`), his tasks (`my_tasks`) and the `Verify` column at the start of every turn. When he can schedule a wake-up, he schedules one 10 minutes ahead while a task is assigned to him or waiting in `Verify`, and 30 minutes ahead otherwise. He handles a `split help` task or a question that names him first, then a task in `Verify`, then anything else. He also checks that Pia is available, and restarts her when she is not (section 1).
- Idle ladder: with nothing to do, wake after 5, then 15, then 30 minutes, and stay at 30 until something arrives. This keeps cheap models cheap.
- Pia runs `node crew.mjs idle` on every wake-up, before her inbox. It prints each free worker (state `idle` on the board's crew activity) with the Backlog cards that worker may start next, own cards first, and the startable cards. She gives every free worker the next card they may start: the top priority first, skipping a card whose "start only after" or "depends on" is not met. Reviews, gates and questions run alongside; a free worker is never left without a card. Cards that edit the same files go to the same worker, one after the other.
- A worker's own card in a review gate does not keep the worker busy: the reviewer holds it, so the worker shows idle, with the gate named (`waitingOn`).

## 6. The flow, phase by phase

### Phase 1: Intake (Cato)

1. Cato takes a request from the Owner or from allowlisted automation. Anything else is ignored.
2. Surface analysis only, no deep dive. Cut it into the smallest steps.
3. Create the main task and one subtask per step in Backlog. Subtasks are narrow and concrete: one outcome, named files or screens where known, and a line saying how to tell it is done.
4. Tag `research required` or `triage required`. Visibility internal unless the Owner says otherwise.
5. Assign the main task to Pia. If Pia is not running, start her: she is the only crew member Cato starts. Cato stops. Log the intake time.

### Phase 2: Triage (Pia)

1. Pia takes the task, notes the start, researches: code pointers, existing patterns, web research summaries, risks. Everything goes into the task description or an update, so a worker needs nothing else.
2. She splits the task into subtasks that a worker can finish quickly, one at a time, and puts them in the order they must be executed. Cato's first cut is a starting point, not the final split: she merges, splits further and reorders it using what the research found.
   - Each subtask has one outcome, fits in the 60-minute worker time-box (section 4), and carries the acceptance line.
   - The order is written into the title as a number (`1/5 Add the table`, `2/5 Write the endpoint`), so the order survives any board sorting.
   - A subtask that needs the result of an earlier one says so ("needs 2/5"). Anything a worker could do in parallel she says so too, but a worker takes subtasks strictly in order unless told otherwise.
   - **When Pia cannot split it herself, she asks Cato.** She cannot split it when, after two attempts, any subtask still exceeds the 60-minute time-box or still fails a no-ambiguity rule, or when the research left her unable to say what the first subtask is. Then she posts an update that names which subtask or step she cannot split and the exact reason in one sentence, tags the task `split help`, tags `@cato`, moves the task to `Blocked` and takes the next task. She does not hand an unsplit or half-split task to a worker.
   - Cato splits it, rewrites the subtasks under the same rules, removes the `split help` tag, assigns the task back to Pia and moves it to `Backlog`. Pia takes it from step 3 on, after checking the split against the rules in section 1.
   - A subtask too big for the time-box is split again. A split is not finished until every subtask passes the no-ambiguity rules in section 1: where research found two ways to do it, she picks one, writes down which and why in one line, and the subtask names only that one.
3. She sets a priority (urgent, high, normal, low) and an estimate. The estimate is in minutes and is the sum of the subtask estimates.
4. She assigns to the worker already in that area, otherwise a worker with no open task. No worker holds more than one In progress task.
5. Moves it to `To do`, starts the worker if the worker is not running (Pia starts her workers herself), logs the time, goes to the next task.
6. A question she cannot answer: tag `@cato` with the question, move the task to `Blocked`, take the next task. When Cato answers, she passes it on and unblocks.

### Phase 3: Build (worker)

1. Wake, check inbox, take the assigned task, move it to `In progress`, note the start.
2. Read the brief and the subtasks, and work them in the order Pia numbered them, finishing one before starting the next. **Do not assume: if anything is unclear, ask Pia first.** Wait for the answer working on another subtask if there is one, else `Blocked`.
3. Work in your own branch and worktree (your cubicle: own database, redis and tools). One pull request per main task, named with the task number first: `Taskmanager-TASKID TITLE` (TASKID is the main task's number, TITLE is its title). Subtasks share the parent's branch.
4. Never push to the main branch, never merge, never touch another worker's database.
5. Finish: run the whole test suite and see it pass (hard rule 9). Tag every finished subtask `verify CQ` and `verify QA`, and also `verify UX` when the subtask modified a UX element (see section 3). Attach evidence (the test output with its pass and fail counts, a screenshot, the pull request link), move the main task to `Verify PM`, assign Pia, log the time.

### Phase 4: Verify PM (Pia)

1. Check against the brief and the acceptance lines: every subtask carries `verify CQ` and `verify QA`, plus `verify UX` where it modified a UX element, evidence attached, the pull request exists and is named right, no "I think it is done". The test output in the evidence shows 0 failures. Output with a failure goes back to the worker, whatever caused it.
2. Anything missing: back to the worker as a subtask, task to `In progress`.
3. Send the task through every gate, in this order: `Verify UX`, `Verify CQ`, `Verify QA`. A UX element is anything a user sees or interacts with: a screen, a component, a text, a layout, a style, a form, an error message, an email. Pia corrects a `verify UX` tag the worker got wrong, in either direction.
   - Any subtask has `verify UX`: assign Usher and move to `Verify UX`.
   - No subtask has `verify UX`: skip `Verify UX`, assign Nina, move to `Verify CQ`, and say in an update that UX was skipped because no UX element was modified.
   - `Verify CQ` and `Verify QA` are never skipped.
4. A task returns here after every gate. Pia reads the marker and checks who set it. Pia starts each reviewer herself when a task enters that reviewer's gate and the reviewer is not running.
5. When the owner of the gate just passed has set the approval, Pia sends the task on: after `UX approved` to Nina in `Verify CQ`; after `CQ approved` to Quincy in `Verify QA`; after `QA approved` to `Verify`, assigned to Cato.

### Phase 5: Verify UX (Usher)

1. Tests usability, accessibility, responsiveness, logical flow, guidance on where to go next, no dead ends. The test is: could a person with no browser experience work it out.
2. Test the whole changed flow in context, not only the diff.
3. Each issue becomes its own subtask tagged `UX violation`, assigned to Pia. Narrow, one issue each.
4. Pia picks the worker. If the original worker is gone or compacted, she gives it to whoever is free and puts the context in the subtask.
5. When fixes come back he re-checks each, then runs the whole flow once more, since fixes change flows.
6. No open issues: tag `UX approved`, move to `Verify PM`, assign Pia, log time.

### Phase 6: Verify CQ (Nina)

1. Checks the branch for duplicated code, logic errors, security problems, code style and static analysis, and that the code that delivers behaviour is covered by tests.
2. Keeps tests lean: no test that repeats what another test already proves.
3. Flags comments that restate the code. Comments stay only where the reason is not visible in the code.
4. Each finding is a subtask tagged `CQ violation`, assigned to Pia.
5. After fixes she re-checks the changes and the files they touched. Nothing left: tag `CQ approved`, move to `Verify PM`, assign Pia, log time.
6. If a CQ fix changes what the user sees, Pia sends the task through UX again.

### Phase 7: Verify QA (Quincy)

1. Uses the result as a customer would, following the user stories and their scenarios when present. For code or API work, uses it as an agent would with no prior knowledge.
2. Each implementation or usage gap is a subtask tagged `QA violation`, assigned to Pia.
3. Nothing left: tag `QA approved`, move to `Verify PM`, assign Pia, log time.

### Phase 8: Verify PM to Verify (Pia)

All subtasks complete, tested, evidence attached, `CQ approved` and `QA approved` set by their owners, and `UX approved` set by its owner when `Verify UX` ran. Move to `Verify`, assign Cato, and post a short summary: what changed, how it was checked, time per phase.

### Phase 9: Final review (Cato)

1. Reviews the whole merge request strictly and fairly: weak points, failures, scope.
2. Each issue is a narrow subtask tagged `Feedback Cato`. Narrow means a cheap model can finish it without choices left open.
3. Issues found: assign the main task to Pia and move it to `Backlog`. It goes back through triage (Phase 2), not to `Verify PM`, because Cato knows more than Pia and his feedback can open branches of work nobody planned. Pia triages the `Feedback Cato` subtasks like any new task: she splits, orders and assigns them. The fixed task then passes every gate again, with `Verify UX` only when a UX element was modified.
4. No issues: Cato merges (only Cato merges), moves the task to `Ready for live`, and tells the Owner in a customer-visible update that it is theirs to take live. When the Owner has taken it live or accepted it, and nothing is left open for the crew, Cato moves it to `Done`. Before he merges he runs the whole test suite on the merge request branch and sees 0 failures.

### A failing test nobody can explain (any phase)

Hard rule 9 applies to every agent. This is what happens when it cannot be followed alone.

1. **Whoever sees the failure** has 30 minutes to find the cause and fix it. A cause is a sentence that names the file and the line, or the missing prerequisite. "Flaky" and "environment" are not causes.
2. **No cause after 30 minutes:** post an update with the exact test name, the exact failure line from the output, the command that ran, and what was tried, one line per attempt. Tag the task `test failing`, tag `@pia`, move it to `Blocked` and take the next task. A reviewer who sees the failure does the same, whatever gate the task is in.
3. **Pia** has 15 minutes. If she can say why, she writes the cause and the fix into the task as a subtask and unblocks it. If she cannot, she copies the update to a task assigned to Cato, tags `@cato` and `test failing`, and leaves the original task in `Blocked`. She does not ask a worker to skip, delete or loosen the test.
4. **Cato** has 30 minutes. He either finds and fixes the cause himself, or rewrites it as subtasks under the no-ambiguity rules, assigns the task to Pia and moves it to `Backlog`. When he cannot find a cause either, he tells the Owner in a customer-visible update: the test, the failure line and what was tried. The Owner decides. Nobody changes the test before that.
5. **The tag comes off** only when the suite passes: Cato removes `test failing`, then Pia unblocks the original task.
6. A task never moves to `Verify` or `Done` while a test fails. A failure that was already there before the task started is still raised this way, and the worker names that in the update.

## 7. Additions to the Owner's first description

1. **Blocked path and escalation.** Blocked tasks are tagged, linked to what blocks them, and Pia raises them with Cato. No agent waits in silence.
2. **Rework cap.** The same task returning through the same gate three times goes to Cato with a note.
3. **Evidence rule.** A handover without evidence (test output, screenshot, pull request link) is sent back by Pia without further review.
4. **One handover format.** Every handover update has the same lines: done, how checked, branch and pull request, open risks, time spent.
5. **WIP limit.** One In progress task per worker.
6. **Merge rights.** Only Cato merges. Workers push their own branch only.
7. **Stale timers and silence.** Pia's sweep in section 4.
8. **Priority meanings.** Urgent: before anything else. High: next. Normal: in order. Low: only when idle.
9. **Human interrupts.** A message from the Owner to Cato that changes direction: Cato tells Pia, Pia parks affected tasks in Blocked with a reason.
10. **Shutdown.** When a crew is disabled, Pia first moves every In progress task back to To do unassigned with a note.

## 8. What the code does today (checked 2026-11-05)

- The model of each crew member comes from `models` in `crew.json` and defaults to `haiku` (section 10, item 4). That works for Claude only: a person set to OpenRouter or Ollama gets no agent definition yet.
- The people have display names (Wren Worker, Wade Worker) and chat nicks (`wren`, `wade`), and their keys are the same: `wren`, `wick`, `wynn`, `wade`. `@wade` is matched against the account's display name or its first name (`server/utils/notifyEvents.ts:87`), so it works when the account is named "Wade Worker".
- A mention leaves a stored `mention` notification for each person on the board it names (Q58), so an agent that is asleep between wake-ups finds it in `list_notifications`. The live event still goes only to an agent that is watching its event stream (`agentEventHub.watches`).
- A crew board made after 2026-11-05 has the columns Backlog, To do, In progress, Verify PM, Verify UX, Verify CQ, Verify QA, Verify, Ready for live, Done, Blocked and Bugs, and an agent hears a card moving into any review gate or Blocked. Boards made before that keep their old columns. The kit documents describe the gates (`CREW.md.tmpl` rules 7 and 7b, `PIA-UX.md.tmpl`, `NINA.md.tmpl`, `USHER.md.tmpl`, `QUINCY.md.tmpl`, `SKILL.md`). Quincy is in the cast (key `quincy`), in the crew API, in forks and in `init.mjs`. A crew made before Quincy existed gets his account on its next rotate; a fork made before then has no Quincy until it is forked again. Nina's key is `nina` and Pia's is `pia` (renamed 2026-11-05, Q70).
- The agents have `log_time`, `list_time`, `start_timer` and `stop_timer` over MCP.
- Boss starts only Pia (2026-11-05). She runs as her own Claude Code session, with or without a channel, and starts her workers, reviewers and log watcher herself with the `Agent` tool (`PROMPTS.md.tmpl`, "Starting Pia"; `CREW.md.tmpl`, "How the PM starts a worker or reviewer"). The `WAKE` comment is gone: a comment that asks Boss to start someone is text, not an order. Not tested end to end: starting Pia's session through the `interactive-shell` skill, and Pia starting subagents from a session that holds a channel. The reasoning is that a subagent cannot start other agents, but a top-level session can.

## 9. Decisions

Decided by the Owner:

- **Q56, Cato's model and how Cato learns the crew.** Cato runs on whatever model the Owner picks, or the model the Owner is chatting with: Sonnet, Opus, Gemma and so on. The kit does not launch Cato or set his model. The crew skill for Cato comes through the Taskmanager MCP server: its `initialize` answer carries Cato's instructions (`server/utils/crewBossSkill.ts`) for any key whose owner created a live crew or attached a crew to a board. The crew's own accounts never get them. Cato's text covers intake, a help request from Pia and the final review, so the session knows how to behave with the crew without a skill file being installed.
- **Q57.** Yes: add `start_timer` and `stop_timer` MCP tools. Section 4 then means them literally.
- **Q58.** Yes: a mention is stored as a notification in the agent's inbox. It reaches only members of the project the task is on. A `@wade` on one board never tags a Wade on another board.
- **Q60.** Yes: rename the keys `w1` to `w4` to `wren`, `wick`, `wynn`, `wade`, and with Q66 `pietje` to `usher`. Done 2026-11-05. The server moves the account addresses, key names and fork rows of existing crews when it starts. The kit moves an old crew home (`creds.json`, browser profiles, channel and listen state) the first time it loads.
- **Q61.** Keep the section 4 numbers as ceilings. Real times will be shorter. Re-evaluate once the time logs hold real data (Pia's weekly figure).
- **Q62.** After Cato rejects a task it goes back to triage with Pia, not to `Verify PM`. Cato knows more than Pia, so his feedback can open branches of work nobody planned.
- **Q63.** Every task passes all gates. The one exception is UX: it is skipped when no UX element was modified, because there is nothing for Usher to check.
- **Q56b.** Usher, Nina and Quincy run on the same level as the workers. Every review pass is a fresh start with no memory of an earlier pass, so they stay clear-minded.
- **Q59a.** The kit fixes no model name, because names change. The default is the cheap but functional tier, and the Owner decides which model each person runs on. It is a user preference, set per person in `crew.json`.
- **Q59b.** Non-Claude models run through OpenRouter and through Ollama on the local machine.
- **Q64.** `unslop` ships with the kit (`unslop.SKILL.md`, read from the Owner's `~/.claude/skills/unslop`). `init.mjs` copies it into the skills folder when it is missing.
- **Q65.** Cato can be any agent in any state, including one that has no crew yet and is about to start one. So the Boss text comes with the MCP instructions for every key whose owner can run a crew: the instance admin (the only person who can create a crew), or anyone who has created a live crew or attached one to a board. It does not wait for a crew to exist. With no crew yet, the text tells Cato to ask the Owner to create one and give the board a crew, and to do nothing else until then.

- **Q68.** No test may fail. Every agent runs the project's test command before handing work on. A test that needs something that is not there (a server, a browser, a variable) skips with the reason stated, so the suite cannot fail for a missing prerequisite. When nobody can say why a test fails, Pia raises it with Cato (hard rule 9 and "A failing test nobody can explain" in section 6). Decided 2026-11-05, after the arnotes suite was brought to 0 failures.

- **Q70.** Rename the keys `pm` to `pia` and `nitpicker` to `nina`, so keys, usernames and chat nicks agree. Done 2026-11-05, with the same migrations as Q60: the server moves account addresses, key names and fork rows when it starts, and the kit moves an old crew home (`creds.json`, `crew.json`, profiles, channel and listen state) the first time it loads. `NITPICKER.md.tmpl` is `NINA.md.tmpl`. A forks file from the board that was stored before the rename keeps the old keys in `CREW_HOME/forks`: hand over a fresh one from the board.

- **Q71.** `Ready for live` stays. It means the work is handed to the Owner, who can take it live or accept it. `Done` means everything is wrapped up and the crew does not need to act on it anymore. Cato merges and moves a task to `Ready for live`, and moves it to `Done` once the Owner has taken it live or accepted it and nothing is left open (section 2, Phase 9).
- **Q59a (guidance).** The kit gives guidance per provider in the style of "`haiku` for Claude": the cheap tier by name where the provider has one, the criteria where it does not, and one step up when a person needs it (`README.md`, "Models").

## 10. Work still to do in the kit and the app (tracked as tasks)

1. Done (2026-11-05): MCP tools `start_timer` and `stop_timer` (Q57).
2. Done (2026-11-05): a stored mention notification for project members only (Q58).
3. Done (2026-11-05): rename the person keys to `wren`, `wick`, `wynn`, `wade` and `usher`, and migrate the data of existing crews (Q60, Q66).
4. Done for Claude (2026-11-05): a model setting per person in `crew.json` (Q59a), `models`, with guidance per provider in `README.md` ("Models"). It names a provider (`claude`, `openrouter` or `ollama`) and a model, both chosen by the Owner. When it is unset, the person gets `haiku`, Claude Code's name for the cheap tier, and `default` in `models` changes that for everyone not named. `init.mjs` writes the model into the agent definitions and `PROMPTS.md` uses it for the `Agent` calls and for Pia's `claude --model`. A person set to `openrouter` or `ollama` gets no agent definition and a warning, until item 5 is built.
5. Running a person on OpenRouter or Ollama (Q59b). A person on a Claude model stays an agent definition file. As far as I know, a subagent runs on the provider of the session that starts it, so a person on OpenRouter or Ollama has to be its own Claude Code process, started with environment variables that point at the provider. I have not tested this. From community guides, not from the official documentation: Ollama 0.14.0 and later answers the Anthropic Messages API at `http://localhost:11434`; OpenRouter takes the key in `ANTHROPIC_AUTH_TOKEN` with `ANTHROPIC_API_KEY` left empty, and the guides disagree on the base URL (`https://openrouter.ai/api` or `https://openrouter.ai/api/v1`); the haiku, sonnet and opus model slots must all be mapped to the chosen model, or the unmapped slots fail with "model not found". Check these against the OpenRouter, Ollama and Claude Code documentation before building.
6. Done for new crew boards (2026-11-05): board columns `Verify PM`, `Verify UX`, `Verify CQ`, `Verify QA` and `Blocked` in the crew's board template.
7. Done (2026-11-05): Usher, Nina and Quincy in the crew skill's cast table, the init script, the crew API and the forks. Cato is not launched.
8. Done (2026-11-05): the tags in section 3 are in `CREW.md.tmpl` rule 7b. Labels are free text on a board, so nothing is created on it. The test rule (hard rule 9) is in `PROMPTS.md.tmpl`, `CREW.md.tmpl`, `PROJECT-RULES.md.tmpl` and Cato's text (`crewBossSkill.ts`).
9. Done (2026-11-05, not tested end to end): Pia starts the workers and the reviewers, and Boss starts only Pia. The `WAKE` comment is replaced in `PROMPTS.md.tmpl`, `CREW.md.tmpl`, `SKILL.md`, Cato's text (`crewBossSkill.ts`) and the setup page's messages. `channel.mjs` needed no change: it only delivers events.
