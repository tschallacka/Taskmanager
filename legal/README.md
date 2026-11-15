# Legal documents

The privacy policy and the legal notice (Impressum) of the service. They are plain Markdown files, so every change is in git history, and every version that was ever in force stays readable.

```
legal/
  privacy/
    current.md            the version in force now
    archive/              frozen copies of earlier versions
  imprint/
    current.md            the version in force now (German text, then the English translation)
    archive/
```

## Front matter

Every document starts with:

```
document: privacy | imprint
title:    the page title
version:  MAJOR.MINOR.PATCH
effective: date this version takes effect (YYYY-MM-DD)
changed:  date the text was last edited (YYYY-MM-DD)
language: en | de+en
status:   draft | published
```

`status: draft` means the page is not shown to the public. A document may be published only when it contains no placeholder of the form `[[...]]`: those mark facts that only the operator knows (hosting provider, log retention and so on). The page that renders these files must refuse to publish a document that still contains one.

## Version numbers

- **MAJOR**: a change that alters what happens to people's data or what they may expect (a new purpose, a new recipient, a new transfer outside the EEA, a longer retention, a new kind of data). People must be told before it takes effect (in the service or by email).
- **MINOR**: an addition or a clarification that does not change what happens to the data (a new right explained better, a new contact route).
- **PATCH**: wording, typos, formatting, a changed address that does not change the controller.

The legal notice follows the same rule: MAJOR for a new controller or a new legal entity, MINOR for added statements, PATCH for the rest.

## How to publish a new version

1. Copy `current.md` to `archive/<version>_<effective date>.md` (for example `archive/1.0.0_2026-11-15.md`) **unchanged**, with `status: published`. An archived file is never edited again. If an archived file has a mistake, say so in the next version's history, not in the old file.
2. Edit `current.md`: raise `version`, set `effective` (the day it takes effect) and `changed` (the day it was edited), and add a row to the **Version history** table at the end of the document, with a short note of what changed.
3. For a MAJOR change, give notice to the people affected before `effective`.
4. Check the placeholders list below.
5. One pull request, with the usual version bump and a changelog fragment.

## What the public pages show

- `/privacy` and `/imprint`: the current version, with its number and its dates at the top.
- `/privacy/archive` and `/imprint/archive`: a list of all versions (number, in force from and to, a link), newest first, each readable as it was.

Each archive entry shows "In force from <effective>" and "Replaced on <effective of the next version>".

## Open placeholders in `privacy/current.md` (version 1.0.0)

| Placeholder | What is needed |
|---|---|
| `[[HOSTING-LOCATION: ...]]` | country of the Contabo data center the server stands in (provider: Contabo GmbH, Munich, filled in) |
| `[[EMAIL-SERVICE: ...]]` | name and country of the email service, or "the server's own mail system" |

These documents are written to match what the application does on the day of `effective`. They are not a substitute for legal advice.
