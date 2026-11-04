---
title: Set up the GitHub webhook and its queue
summary: Point GitHub at your server, pick the events to send, and know what happens when a delivery fails and how to retry it
requires: instance-admin
topics: github, webhook, secret, events, rabbitmq, queue, failed delivery, retry, token, 503, 429
order: 50
---

Links and issue sync work best when GitHub tells Taskmanager about each change. That is the webhook. As the person who runs the instance you set it up once, on the server and on GitHub.

## On the server

Set these in the server's environment (see [Configuration](/help/admin/configuration) for where):

- `GITHUB_WEBHOOK_SECRET`: a secret of your choosing. Until it is set, the webhook answers 503 to everything.
- `RABBITMQ_URL`: the broker the deliveries wait in, written `amqp://user:password@host:5672/vhost`. Docker Compose starts one for you and builds this from `RABBITMQ_PASSWORD`, which it requires in `.env`. The NixOS module can run one with `services.arnotes.queue.enable`. Without a broker, a production server answers 503 to GitHub events that name a repository. The URL carries the broker's password, so keep it out of logs and command lines, and use a URL-safe password.
- `GITHUB_TOKEN`: a token that can read the repositories. Optional for public ones, at GitHub's lower rate limit. It is only ever sent to GitHub.
- `GITHUB_ALLOWED_OWNERS`: a comma list of GitHub owners that may be linked. Empty allows any owner the token can see. Set it in production: the token can read every repository it has access to.

## On GitHub

In the repository's or organisation's settings, add a webhook:

1. **Payload URL**: your public address followed by `/api/github/webhook`, for example `https://taskmanager.example.com/api/github/webhook`.
2. **Content type**: `application/json`.
3. **Secret**: the same value as `GITHUB_WEBHOOK_SECRET`.
4. **Events**: choose individual events and select **Issues**, **Issue comments**, **Pull requests**, **Check runs** and **Workflow runs**. The first two feed issue sync, the others feed the pipeline and merge tags and refresh links.

<!-- requires: staff -->
What those events do on a board is described in [Pipeline and merge tags](/help/integrations/pipeline-and-merge-tags) and [Sync GitHub issues to cards](/help/integrations/sync-issues-to-cards).
<!-- /requires -->

Other events are accepted and ignored. Opening the address in a browser answers 405, because only GitHub's POST is taken.

## What the webhook answers

| Answer | Meaning |
|---|---|
| 202 | Taken. For a delivery with a repository it was put in the queue first, and GitHub is only told 202 once the broker confirmed. |
| 401 | The signature does not match the secret. |
| 400 | The delivery id is missing or not plain characters, or the body is not JSON. |
| 413 | The body is over 2 MB. |
| 429 | The repository sent more than 120 issue or comment deliveries in a minute. `GITHUB_DELIVERY_PER_MINUTE` changes the number (1 to 100000). Redeliver after a minute. |
| 503 | No secret, no broker, the broker did not confirm, or the server is shutting down. |

A 4xx or 503 shows as failed under the webhook's recent deliveries on GitHub, where you can redeliver it.

## What happens after it is taken

One delivery is applied at a time, in order. A failure that may pass is tried again after 30 seconds and then after 2 minutes, three tries in all. A failure that cannot pass (a body that is not JSON, a board with no column to put a card in) is set aside at once. Either way, the delivery is then written to a failed list with its reason and the raw body, and copied to a failed queue. GitHub still shows it as delivered.

The failed list keeps the payload for 30 days, then removes it and keeps the metadata. A delivery whose payload has expired cannot be retried.

The crew's project manager is told of a new failure live, but only if it is connected at that moment. There is no page in the app for failed deliveries. They are read and handled through agent tools:

- `list_failed_deliveries`, `get_failed_delivery` (metadata and a short preview, never the whole payload) and `github_queue_status` work with the key of anyone who works on a board that links the repository. They show only the repositories of those boards, and a delivery of any other repository is answered as not found.
- `retry_failed_delivery` and `discard_failed_delivery` (with a reason of 3 to 300 characters) work only with the project manager key of the team's crew. A personal board has no crew, so nobody retries there.
- A retry sends the stored payload again once. A second press says it was already retried. A retry that was never concluded can be claimed again after 10 minutes.

## Keep in mind

- **Run one server process.** The order in which one repository's deliveries are applied is kept in memory. After a restart a newer delivery can overtake an older retried one.
- **Time limits.** One delivery gets 60 seconds, each database call 30. `GITHUB_DELIVERY_BUDGET_MS` and `GITHUB_DELIVERY_ADAPTER_TIMEOUT_MS` change them, and the first must be the shorter.
- **GitHub reads** for tags are limited to 60 a minute per repository by default (`GITHUB_TAG_READS_PER_MINUTE`).
- **A queue that will not declare.** If an older broker holds a queue with different arguments, the broker refuses with `PRECONDITION_FAILED` and the server answers 503. Delete the old queue and let the server declare it again. Check the depth first, because a queue that still holds messages loses them: `rabbitmqctl -p arnotes delete_queue github.deliveries`. The `-p arnotes` matters, it names the vhost.
- **Shutdown** is graceful: the webhook answers 503, the delivery in hand has 20 seconds to finish, and an unfinished one is put back.

Under the workbench install, the `env` file that `install.sh` writes has no `RABBITMQ_URL`, `GITHUB_WEBHOOK_SECRET` or `GITHUB_TOKEN`. Add what you need to that file and restart the server before you expect GitHub events to be taken.
