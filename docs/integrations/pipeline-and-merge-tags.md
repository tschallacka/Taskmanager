---
title: Pipeline and merge tags
summary: How GitHub pull requests tag your cards with the state of their checks and where they were merged
requires: staff
topics: github, pipeline, merge, tags, staging, production, checks, pull request, closes issue
order: 40
---

When a pull request changes, Taskmanager can tag the cards it belongs to, so you see on the board whether the checks pass and whether the work has reached staging or production. Nobody sets these tags. They are built in, and no rule adds them.

## The tags

| Tag | When |
|---|---|
| `pipeline running` | The pull request's head commit still has unfinished checks. |
| `pipeline failed` | A finished check failed. |
| `pipeline passed` | Every check has finished and is green. |
| `merged staging` | The pull request was merged into a staging branch. |
| `merged production` | The pull request was merged into a production branch. |
| `pr closed` | The pull request was closed without merging. Reopening it removes the tag. |

There is only ever one pipeline tag on a card. A new one replaces the old one. A tag that is not on the board yet is created with a fixed colour. A tag that is already there keeps its colour, and no other tag is touched.

Each change is written in the card's activity as made by GitHub, with the pull request's link. A redelivery of the same event changes nothing.

## Which cards are tagged

- A card with a link to the pull request itself is always tagged. You make that link on the task: [Link a task to a GitHub issue or pull request](/help/integrations/link-tasks-to-github).
- A card linked to an issue is tagged when the pull request closes that issue with `Fixes #12`, `Closes #12` or `Resolves #12` in its title or description, and all of these are true:
  - the pull request comes from the same repository, not from a fork
  - its author is one of the **Accepted GitHub logins** of the repository, the list that also gates issue sync
  - the board has issue sync on for that repository, or links the pull request itself

  Otherwise the keyword is ignored. `owner/repo#12` is never read, and a plain `#12` closes nothing.

The keywords count on any base branch, not only the default one.

## How the pipeline state is worked out

Taskmanager reads the pull request's head commit from GitHub and looks at all of its check runs, required or not. Any failure makes it failed, an unfinished run makes it running, and it is passed only when every finished run is green. A commit with no check runs changes nothing. Older commit statuses are not read.

A draft pull request gets pipeline tags too. An event about a commit that is no longer the head is ignored.

A pull request from a fork gets its merge and close tags. Its pipeline tags only change when it is opened, reopened or updated, because GitHub's check events for a fork do not name the pull request.

## Staging and production

**Staging branches** and **Production branches** are set per repository, in the board's Settings under **Repositories**, in the issue sync panel. Only the project's owner and the team's owners and admins can change them.

- Branch names are written with commas between them, up to 10, and are matched exactly: `Staging` is not `staging`.
- With **Production branches** empty, production means the repository's default branch.
- A branch cannot be both staging and production.
- Staging is empty until you set it, so no `merged staging` tag appears until then.

## What the agents hear

When a card gets `pipeline failed`, `pipeline passed`, `merged staging` or `merged production`, connected agents are told once per card, after the change is saved: the events are `pipeline_failed`, `pipeline_passed`, `merged_staging` and `merged_production`. If the event cannot be sent, the tags stay.

## When tags are missing

- The webhook must send the **Pull requests**, **Check runs** and **Workflow runs** events. Ask whoever runs your instance.
- Taskmanager reads GitHub for each change. A server with no GitHub token can only read what GitHub shows anonymously, and at a lower rate limit.
- Reads are limited per repository, 60 a minute by default. A burst of check events shares one read when they are about the same commit, so a busy repository still tags correctly, but a spent limit delays a change. A delayed change is tried again.
- A pull request that no card is linked to is not read at all.

<!-- requires: instance-admin -->
The webhook, its events and the read limit are explained in [Set up the GitHub webhook](/help/integrations/github-webhook-and-queue).
<!-- /requires -->
