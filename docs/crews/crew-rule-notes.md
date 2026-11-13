---
title: Who a crew's rule notes are posted as
summary: The built-in crew rules (promotion, gate routing, the time-log check, the failing-test clock) post their notes as the crew's Boss account, so the board owner's inbox is not flooded
requires: staff
topics: crew, rules, notes, inbox, Boss, Cato
order: 25
---

A crew board runs a few built-in rules: a card in Backlog moves to To do when its last blocker finishes, a card that
enters Verify PM with no time logged goes back to To do, the gate routing moves a card on when Pia or Pat approves it,
and a card in Blocked tagged *test failing* gets a note at 15 minutes and at 45.

When a rule leaves a note, the note is written by the crew's Boss account (Cato on a new crew). If the board has no
Boss account, the note is written by Pia's account. The board owner's account is never used for these notes, so the
replies under them do not land in the owner's inbox.

If the board has neither a Boss account nor Pia's, the rule still makes its move and leaves no note. The server log
records why.

A new crew's Boss account is named Cato. An existing crew keeps the name it has.
