---
title: Link a task to a GitHub issue or pull request
summary: Attach an issue, pull request, branch or workflow run to a task and read its state without leaving Taskmanager
requires: staff
topics: github, issue, pull request, branch, workflow run, link, task, refresh, unlink
order: 20
---

A task can carry links to GitHub. Each link shows what GitHub says about the item: an issue's labels, people and comments, a pull request's review and checks, a branch's position against the default branch, a workflow run's status. You never leave the task to see it.

## Link something

1. Open the task. The **GitHub** section is in the task panel.
2. Paste one of these into the box:
   - a link to an issue or pull request on github.com
   - a link to a branch (`https://github.com/owner/repo/tree/branch-name`)
   - a link to a workflow run (`https://github.com/owner/repo/actions/runs/123456`)
   - `owner/repo#123`
   - `#123`, which means issue 123 in the board's default repository
3. Pick **Team only** or **Shared with customer** next to the box.
4. Press **Link**.

Only links to `https://github.com` are read. `#123` needs a default repository, which you set under the board's Settings, then Repositories. See [Link a GitHub repository to a board](/help/integrations/link-a-repository).

`owner/repo#123` could be an issue or a pull request. Taskmanager stores it as what GitHub says it is, once it has read it.

The same item cannot be linked to a task twice. A task can hold several links.

## What you see

Each link shows a state badge (open, closed, merged, draft, or a run's result), the title, and the details for its kind. Press the arrow icon to open the item on GitHub.

On the board, a task's card shows a one-line badge for its first link, such as `#45 merged, checks passing`. The board never asks GitHub. It reads what Taskmanager already holds, so a link that nobody has opened shows `not fetched` until the task panel has looked at it.

## Keep it current

Taskmanager keeps GitHub's answers and does not ask again on every look. Press **Refresh** in the GitHub section to ask GitHub again. GitHub's rate limits still apply.

If the server has a webhook set up, GitHub tells Taskmanager when an issue, pull request, check or run changes, and the links update by themselves. Without it, use **Refresh**.

## When a link shows an error

The error appears in words under the link:

- **Not found on GitHub, or no access.** The item does not exist, or the server's token cannot see it.
- **GitHub is rate limiting us, retry at 14:05.** GitHub's limit was hit. The time is when to try again.
- **GitHub refused the request.**
- **GitHub could not be reached.** Try again in a moment.

If the error stays, tell whoever runs your instance. A missing token or a restricted list of GitHub owners are the usual causes.

If the person who runs the server limited which GitHub owners can be linked, a link to any other owner is refused when you press **Link**, and the message says so.

## Take a link off

Press the unlink icon on the link and confirm **Remove link**. The task stops showing the item. GitHub itself is not changed.

## Who sees a link

Team members see every link. A customer's contact sees only the links marked **Shared with customer**, and cannot add or remove any. Someone who may not see a link never causes a request to GitHub for it.

## Agents

An agent with a key for your team can do the same. `link_github` and `unlink_github` need a key that may change things, `get_task_github` can be used with a read-only key. All three are for the team, not for a customer's contact.

If you want a task to be made from a GitHub issue instead of linking an issue to a task that already exists, see [Sync GitHub issues to cards](/help/integrations/sync-issues-to-cards).
