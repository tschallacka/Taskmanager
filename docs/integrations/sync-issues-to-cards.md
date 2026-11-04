---
title: Sync GitHub issues to cards
summary: Turn the issues of a linked repository into cards on a board, with their comments as updates, and choose whose issues count
requires: staff
topics: github, issue sync, card, accepted logins, catch up, convert issue to task, comments, webhook
order: 30
---

Issue sync turns GitHub issues into cards. When someone you trust opens an issue in a linked repository, a card appears on the board, and their comments on the issue arrive as updates on that card. It is how an issue becomes a task without anyone copying it over.

There is no button that converts one issue by hand. To attach an issue to an existing task, [link it](/help/integrations/link-tasks-to-github) instead.

## What you need first

The repository must be linked to the board: [Link a GitHub repository to a board](/help/integrations/link-a-repository). The server must also receive GitHub's webhook, or nothing arrives by itself, and it needs a GitHub token for the catch-up below. Ask whoever runs your instance.

<!-- requires: instance-admin -->
You set these up: [Set up the GitHub webhook](/help/integrations/github-webhook-and-queue).
<!-- /requires -->

## Turn it on

Open the board's Settings, then **Repositories**, and open the issue sync panel under a repository. Every team member can read it, but only the project's owner and the team's owners and admins can change it. For anyone else the fields are greyed and a line says so.

| Setting | What it does |
|---|---|
| **Sync issues from this repository** | The switch. Off means no card is made from its issues. |
| **New cards go to** | The column new cards land in. |
| **Visibility of new cards** | **Team only** or **Shared with customer**. |
| **Accepted GitHub logins** | Whose issues and comments count. |
| **Staging branches** and **Production branches** | Used for the merge tags: [Pipeline and merge tags](/help/integrations/pipeline-and-merge-tags). |
| **Complete the card when its GitHub issue closes** | Off: closing only tags the card `issue closed`. On: it also completes the card. |

Press **Save issue sync settings**. A field marked in red says what is wrong, and nothing is saved until it is fixed.

If you pick **Shared with customer**, a warning appears: issue titles and comments from the accepted logins reach the customer. Only accept people whose text the customer may read.

## Accepted logins

Only issues written by an accepted GitHub login become cards. Anyone else's issue is not copied. It is counted, and the panel says how many were ignored and shows the last one, so you can see why a card did not appear.

- A new repository starts with its owner's login.
- Write logins with commas between them: up to 20, each up to 39 characters. They are saved in lower case and each only once.
- At least one login is needed. An empty list would ignore every issue.
- Logins are compared by name. If an account is renamed on GitHub, someone else can take its old name and their issues would pass. Check the list after a rename.

## What a card looks like

- The title is `[GH #12] Title of the issue`. The card has the tag `github`.
- The description names the issue and its author and quotes its text, copied as data about what the person wants.
- The issue is linked to the card, so its state shows in the GitHub section of the task.
- No person made the card. The activity says it came from GitHub.
- If the column you picked is not on the board any more, the card goes to **Backlog**, or the first column, and a comment on the card says so.

## What happens afterwards

- **A comment** by an accepted login is copied as an update. A comment edited or deleted on GitHub adds a short update saying so. It does not rewrite the old text. Comments by anyone else are dropped without a count.
- **The issue is edited.** The title and text change on the card only while the card still holds what the sync wrote. If someone changed the card on the board, it is left as it is and an update says that the issue changed.
- **The issue is closed.** The card gets the tag `issue closed`, and is completed if you switched that on. **Reopening** removes the tag and clears the completion.
- A card you put in the trash is not brought back by GitHub.
- Pull requests are not synced, and a comment that starts with `Claude (Taskmanager crew session)` is a crew's own reply and is skipped.

## Catch up

Switching sync on queues a catch-up by itself, and **Catch up now** does it again. It reads at most 200 open issues and 50 comments per issue, and makes a card for each issue by an accepted login that has no card yet. It changes no card that exists, so running it twice makes nothing twice.

If you press **Catch up now** on a server that has no GitHub token, it is skipped and the page tells you to ask whoever runs the server. A catch-up is only an extra: new issues still arrive through the webhook.

## When a change does not arrive

GitHub keeps a log of each delivery in the webhook's settings. One that shows as failed there was refused by Taskmanager (for example 429 for too many in a minute, or 503 when it could not be queued). Redeliver it from that screen.

If Taskmanager took a delivery and then could not apply it, it tries again after 30 seconds and after 2 minutes. After the third try it is kept as a failed delivery, and GitHub still shows it as delivered. Only the crew's project manager can retry it. A board with no crew has nobody who can.
