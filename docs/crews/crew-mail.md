# Crew mail

A crew's people send each other short mails from the crew kit's mailbox (its `mailbox.mjs send <to> <text>`, in the crew
home's `bin/`). The mail is kept by the app until the recipient's mailer has delivered it. The mailer runs on the person's own machine and pulls, once a minute, because the
server cannot push to a machine.

## The routes

All three take the person's own crew key as the Bearer token. They live under `/api/crew-mail/`, not `/api/crews/`: the crew
gate answers every `/api/crews/*` path with a 404 to a member key from a remote machine, so mail under `/api/crews` cannot
reach a member on another machine (live QA, 0.20.0).

- `POST /api/crew-mail/<slug>` with `{ "id", "to", "text" }`. `id` is 32 lowercase hex made by the sender's client, so
  a retried send is the same mail (201 again). The sender is the caller's own key; a `from` field in the body is
  ignored. `to` is a crew member key (pia, boss, susy, wren, ...).
- `GET /api/crew-mail/<slug>?to=<key>` returns the undelivered mail for `to`, oldest first, 50 at most. A member reads
  its own mail; the boss key reads any recipient's.
- `POST /api/crew-mail/<slug>/<id>/ack` marks a mail delivered. Only the recipient can ack it (another person's ack is
  403). Acking a delivered mail again is a no-op.

Refused: a key of another crew, a customer or contact key, or a non-crew key (403). A text is never cut: the one safety stop is 1 MB of UTF-8, and a text over it is 413 with its size in the sentence (in the body's `data.error`, and the status line). More
than 30 sends a minute from one sender is 429. More than 500 undelivered for one recipient is 409.

## Retention

Delivered mail is deleted after 7 days; undelivered mail after 30 days. The cleanup runs on a write, at most once a day.

The per-minute limit and the pending cap are soft limits, against runaway loops rather than attackers: each is a check and
then an insert, with no transaction, so a parallel burst may pass by a few.

## The mailer

- Send: POST to the route with a 3 second timeout. When the app does not answer, the mail goes to the outbox
  (`mailbox/outbox/<id>.json`) and the next tick sends it. The key is never written to the outbox.
- Each minute, for each local recipient: flush the outbox, fetch the undelivered mail for the recipient, deliver each
  mail once, then ack it.
- Delivery: a delivered mail is recorded in `mailbox/<to>/seen/<id>` before its ack. If the ack fails, the next tick
  acks it again and does not deliver it twice.
- The line a person sees is `from <from_key>: <text>`. The sender comes from the row, never from the text.

The client is `crew/mail-client.mjs`.
