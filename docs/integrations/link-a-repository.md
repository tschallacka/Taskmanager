---
title: Link a GitHub repository to a board
summary: Choose which GitHub repositories a board reads issues and pull requests from, and which one a bare #123 means
requires: staff
topics: github, repository, link, default repo, visibility, settings, repositories
order: 10
---

A board can read issues, pull requests, branches and workflow runs from GitHub, and show what GitHub says about them on a task. First you tell the board which repositories to use. This page covers that step. Linking a repository changes nothing on GitHub.

## Where it is

Open the board, press **Settings** in the board header (on a phone it is in the board's options menu) and pick **Repositories**. Customer contacts have no Settings page, so they never see this.

Any team member can add a repository, make it the default, change how its links are shown and remove it. The issue sync settings under each repository are different: only the project's owner and the team's owners and admins can change them. Everyone else can read them. See [Sync GitHub issues to cards](/help/integrations/sync-issues-to-cards).

## Add a repository

1. In **Add a repository**, write `owner/repo`, or paste the repository's github.com link.
2. Under **Visibility of its links**, choose **Team only** or **Shared with customer**.
3. Press **Add repository**.

The first repository you add becomes the **Default** one. A board can link up to 20 repositories. GitHub names ignore capitals, so `Acme/Web` and `acme/web` are one repository, and adding it twice is refused.

The server may only allow some GitHub owners. If the person who runs it set a list, an owner that is not on it is refused with a message that names the setting. If that happens, ask whoever runs your instance.

## The default repository

When you link a task to GitHub you can write just `#123`. It means issue 123 in the default repository. Press **Make default** on another row to move it. If the board has no default, `#123` is refused and you write `owner/repo#123` instead.

If you remove the default repository, the board has no default until you make another one.

## Who sees a link

Each link on a task is either **Team only** or **Shared with customer**. A customer's contact sees only the ones shared with them.

Three places decide the choice for a new link:

- In the task panel, the choice next to the **Link** button starts on the board's **Default visibility for new links** (the list near the bottom of the Repositories section). What you pick there is used.
- A repository's own visibility is used when a link is made without a choice, which is what an agent does if it does not say.
- With neither, the link is **Team only**.

Change a repository's visibility with the list on its row. It only affects links made afterwards. Links that already exist keep theirs.

## Remove a repository

Press **Remove** on its row and confirm. Links on tasks stay on their tasks, and the message tells you how many. The repository's issue sync and branch settings go with it, and if it was the default, the default is cleared.

## Recent changes

At the bottom of the section, **Recent changes to these settings** lists the last ten changes to the sync settings, with who made them and when. A change that someone was not allowed to make is listed as refused.

## What else has to be in place

Linking a repository is only the board's half. The server also needs a GitHub token (public repositories work without one, at GitHub's lower rate limit) and a webhook so that changes on GitHub show up by themselves. Without the webhook, a link still works: press **Refresh** on the task to read GitHub again.

<!-- requires: instance-admin -->
As the person who runs the instance, you set the token and the webhook. See [Set up the GitHub webhook](/help/integrations/github-webhook-and-queue) and [Configuration](/help/admin/configuration).
<!-- /requires -->
