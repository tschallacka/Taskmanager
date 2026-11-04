---
title: Time tracking
summary: How time is recorded on tasks, what is private to you and what your team can see
requires: staff
topics: time, time tracking, timer, hours, entries, timesheet, privacy, log time
order: 80
---

Taskmanager records time against **tasks**. You can start a timer while you work, or write down time afterwards. Every
piece of recorded time is an **entry**: a length, the day it belongs to, the task, who logged it, and an optional note.

Time tracking is for the project team. A customer's contact has no time tools, and never sees time that was logged on
the team's boards.

## Two ways to record

- **A timer**: press **Start timer** on a task and **Stop** when you are done. The time between is logged for you.
- **By hand**: type how long it took, and the day it was. Use this for work you forgot to time, or for time you spent
  away from the screen.

Both give the same kind of entry. Steps are in [Start a timer and log time](/help/workspace/log-time).

## How to write a length of time

Anywhere you type a duration, these all work:

| You type | You get |
|---|---|
| `1h 30m` or `1h30m` | 1 hour 30 minutes |
| `1:30` | 1 hour 30 minutes |
| `45m` or `45min` | 45 minutes |
| `2h` | 2 hours |
| `1.5` | 1 hour 30 minutes: a bare number counts as hours |

An entry is at least one minute and at most 24 hours (1440 minutes). Anything else is refused with the message **Write
the time like 1h 30m, 1:30 or 45m**. Times are shown back as `1h 30m`, `2h` or `45m`.

## The timer

- You have **one timer at a time**. Starting a timer on another task stops the first one and logs what it measured,
  so nothing is lost.
- The running timer shows in the sidebar, under the workspace links, with the task title and a clock. Click the title
  to open the task. The square button stops it.
- The timer runs on the server, not in your tab. Closing the browser, or opening Taskmanager on another device, does
  not stop it: it still shows how long it has been running.
- When it stops, the time is rounded to the nearest minute, with a minimum of one minute and a maximum of 24 hours.
- Stopped in the app, the entry is logged on **the day you stop it**, not the day you started it. A timer left
  running overnight lands on the next day, and at most one day's worth is kept.

## What is private and what your team sees

| Thing | Who sees it |
|---|---|
| Your running timer | Only you |
| The **Timesheet** page | Only you: it lists your own entries |
| The **Time** section on a task | The whole project team: every entry on the task, with who logged it |
| The **Time** tab on a project | The whole project team: everyone's time on that project, by person and by task |

So an entry you log is not private. It is part of the task's record, and your teammates can see it with your name.
Your total for the week across projects, though, is only on your Timesheet.

Entries can be **deleted by whoever logged them**, and nobody else, not even a team admin. There is no edit: to
correct an entry, delete it and add it again.

## Agents and time

An AI agent working with your API key can log time on your behalf and read it back. Entries it logs are yours, they
show with your name, and they appear in your Timesheet. A read-only key can read time but not log it. See
[What an AI agent can do here](/help/agents/what-agents-can-do).

## What it does not do

- There is no report per customer. Time is read per project (the **Time** tab) and per person (your Timesheet), so for a
  customer with several boards you read each board in turn.
- Time cannot be logged on a task you cannot open. When a task's panel is read-only for you, the **Time** section is
  not shown in it.

Read your time in [The Timesheet and a project's Time tab](/help/workspace/timesheet). For a worked example, see
[Track a day of work](/help/workspace/track-a-day-of-work).
