# Help pages

These Markdown files are Taskmanager's help. They are read in three places, from this one source:

- the **Help** page in the app (`/help`), with search;
- the **? hints** next to features in the app, which link to a page here;
- **Sprocket** and any connected agent, through the `search_help` and `read_help` tools.

The server bundles this folder into the build, so a deployed instance has the same pages the repository has.

## Help follows permissions

A person is only ever shown help about what they may do. The server cuts every page, and every section of a
page, to the permissions of whoever asks (a browser session, or an API key, which includes Sprocket). A page
they may not read is "not found" for them: not listed, not found by a search, not readable, and its title is
not given away. Write each page, and each section, for exactly the people who can do what it describes.

| Permission | Who holds it |
|---|---|
| `staff` | Works on boards in a team, or in their own workspace. Everyone but a customer contact. |
| `customer` | Logs in as a contact of a customer and sees only what is shared with customers. |
| `team-admin` | Owner or admin of the active team. |
| `team-owner` | Owner of the active team. |
| `instance-admin` | Runs the instance. |
| `write` | May change data: not a read-only API key. |
| `secrets` | May read project secrets. |
| `crews` | May manage crews: the instance admin, and a key with the crews permission. |

A page with no `requires` is for everyone, customer contacts included, so it must say nothing about staff-only
features. Find what the code really enforces (the API route's `requireTeamRole`, `requireInstanceAdmin`, the
audience rules in `server/utils/auth-helpers.ts`) and require exactly that: no more, so people who can do the
thing find the page, and no less, so people who cannot never see it.

## A page

```markdown
---
title: Give a board a crew
summary: Attach a crew to a board and fork its members, step by step
requires: team-admin
topics: crew, shadow board, fork, agents
order: 20
---

Text in Markdown.

<!-- requires: write -->
A section only people who hold `write` see.
<!-- /requires -->
```

- The path under `docs/` is the page's address: `docs/crews/give-a-board-a-crew.md` is `/help/crews/give-a-board-a-crew`.
- `title`, `summary` (what the page is for, one sentence) and `topics` (words people search for, at least two) are required.
- `requires` is a comma list of permissions the reader needs, all of them. `order` sorts pages inside a folder.
- A `<!-- requires: ... -->` section can sit inside a page; it can nest. A section marker with an unknown
  permission, or one that is never closed, fails the test.
- Link to another page as `[Crews](/help/crews/give-a-board-a-crew)`. A page for everyone must not link to a page
  with a `requires` unless the link sits inside a section with the same requirement (the test checks this).
- Fenced ` ```mermaid ` and ` ```chart ` blocks are drawn in the app.
- The folder name is the group the page is listed under. A page directly in `docs/` is listed under "Start here".

## Voice

- Written for someone using the app, not for a developer. Short sentences, second person ("you").
- Start with what the thing is for, then the steps. Name the buttons and menu items exactly as the app does.
- One page, one job: a concept page explains what something is; a how-to page is numbered steps; a tutorial
  walks one realistic example from start to finish.
- Say what happens when something goes wrong, and what is easy to get wrong. Say what cannot be undone.
- Never describe something from memory. Read the code (`codegraph explore`), run the app, or leave it out. If a
  detail is uncertain, say so on the page rather than guess.
- No screenshots (they go stale); describe where to click.

## Checking your pages

```
node --import tsx --test tests/help-docs-content.test.ts
```

It parses every page, checks the title, summary and topics, and that every `/help/...` link lands on a page that
exists and is not behind a permission the linking page lacks.
