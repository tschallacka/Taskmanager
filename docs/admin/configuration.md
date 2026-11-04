---
title: Configure the server with environment variables
summary: Every setting you can change through the server's environment, how to pass it in Docker, NixOS and workbench, and the Sprocket variables
requires: instance-admin
topics: environment variables, configuration, env, smtp, secrets, sprocket, claude code, push notifications, SPROCKET_CLAUDE_BIN
order: 30
---

The server reads its settings from environment variables. Nothing here is changed from inside the app.

## Where to set them

- **Docker Compose:** put them in `.env` next to `docker-compose.yml`. Compose passes on only the variables that the file lists. Ones it does not list, such as `BETTER_AUTH_TRUSTED_ORIGINS`, `MAINTENANCE_MODE`, `GITHUB_DELIVERY_PER_MINUTE` or the `SPROCKET_*` ones, need a line added under `environment:` of the `app` service. Then run `docker compose up -d`.
- **NixOS:** the module has an option for each of the main ones (`services.arnotes.*`, for example `allowSignUp`, `betterAuth.url`, `smtp.host`). Anything else goes in `services.arnotes.environment`. The GitHub token and webhook secret can come from files with `githubIntegration.tokenFile` and `webhookSecretFile`, which keeps them out of the Nix store.
- **Workbench:** the `env` file in `/opt/workbench/data/var/lib/taskmanager`. Restart with `supervisorctl restart taskmanager`.

## The main ones

| Variable | Default | What it does |
|---|---|---|
| `BETTER_AUTH_URL` | `http://localhost:3000` | The public address, exactly. Sign-in depends on it. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | empty | Extra origins, comma separated, that may sign in. |
| `DATABASE_URL` | the bundled PostgreSQL | A full PostgreSQL URL. |
| `BETTER_AUTH_SECRET` | generated | At least 32 random characters. Docker and NixOS generate and keep one. |
| `SECRETS_ENCRYPTION_KEY` | generated | 64 hex characters (`openssl rand -hex 32`). Encrypts project secrets. Back it up apart from the database and never change it. |
| `APP_PORT` | `3000` | The port Compose publishes. |
| `PORT`, `HOST` | `3000`, `0.0.0.0` in Docker | Where the server itself listens. |
| `ALLOW_SIGN_UP` | `true` | Whether anyone may create an account. With `NUXT_PUBLIC_ALLOW_SIGN_UP`, which the login page reads. See [Users and sign-in](/help/admin/users-and-sign-in). |

## Sign-in

`NUXT_PUBLIC_DISCORD_ENABLED`, `NUXT_PUBLIC_GITHUB_ENABLED`, `NUXT_PUBLIC_GOOGLE_ENABLED` and `NUXT_PUBLIC_OIDC_ENABLED` switch a method on. Discord, GitHub and Google each need their own `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` (and the same for `GITHUB_` and `GOOGLE_`); OIDC needs `OIDC_DISCOVERY_URL`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`. `NUXT_PUBLIC_OIDC_NAME` labels its button. `NUXT_PUBLIC_PASSKEYS_ENABLED` defaults to `true`. `NUXT_PUBLIC_EMAIL_CODE_ENABLED` needs mail, below. All of them are in [Users and sign-in](/help/admin/users-and-sign-in).

## Mail and push

| Variable | Default | What it does |
|---|---|---|
| `SMTP_HOST`, `SMTP_FROM` | empty | Both are needed for any mail. Without them nothing that needs mail is switched on. |
| `SMTP_PORT` | `587`, or `465` when secure | |
| `SMTP_SECURE` | `false` | `true` is TLS from the first byte. Otherwise STARTTLS is used when offered. |
| `SMTP_USER`, `SMTP_PASSWORD` | empty | If the server needs a login. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | empty | A key pair for notifications when no tab is open. Both must be set, and the site needs HTTPS. `.env.example` has a command that makes a pair. Keep the pair: a new one drops every device. |
| `VAPID_SUBJECT` | `mailto:admin@localhost` | How push services reach you, a `mailto:` or `https:` URL. |

## GitHub

`GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_ALLOWED_OWNERS` and `RABBITMQ_URL` are explained in [Set up the GitHub webhook and its queue](/help/integrations/github-webhook-and-queue). The tuning ones are `GITHUB_DELIVERY_PER_MINUTE` (120), `GITHUB_TAG_READS_PER_MINUTE` (60), `GITHUB_DELIVERY_BUDGET_MS` and `GITHUB_DELIVERY_ADAPTER_TIMEOUT_MS`. `GITHUB_ECHO_COMMENT_IDS` is a comma list of GitHub comment ids that issue sync skips.

## Maintenance and testing

`MAINTENANCE_MODE` and `MAINTENANCE_FILE` are described in [Run your Taskmanager instance](/help/admin/running-the-instance). `DUE_RULES_INTERVAL_MS` (default 900000, 15 minutes) and `GITHUB_API_URL` are for testing and are ignored when `NODE_ENV` is `production`.

## Sprocket with Claude Code

Sprocket, the assistant in the chat panel, can be answered by Claude Code instead of OpenRouter. The server then runs `claude -p` for each message, on the machine the server runs on, using the Claude Code login of the account the server runs as. Whoever picks it under **Settings**, then **Sprocket**, spends that login. That is why only the instance admin may choose it.

| Variable | What it does |
|---|---|
| `SPROCKET_CLAUDE_BIN` | The `claude` program. By default the server looks in `~/.local/bin`, Homebrew's and `/usr/local/bin`, then the `PATH`. If you set it and the file is not there, Claude Code counts as not installed. |
| `SPROCKET_CLAUDE_FOR_ALL` | `true` lets every account choose Claude Code, on that same login. |
| `SPROCKET_MCP_URL` | How a run reaches this server's own agent endpoint. By default `http://localhost:<PORT>/api/mcp`, or the address in `HOST` when that is a specific address (not `0.0.0.0`). |

A run works as one of the chooser's own API keys, which needs at least board read access, so it sees only what that key may. It gets a short-lived key that exists only in the server's memory for that run, and only a short list of environment variables (such as `HOME` and `PATH`), never the server's secrets. A run stops after 10 minutes.

If **Claude Code** on the Sprocket page says it is not installed, the server cannot find the program. The stock Docker image does not contain Claude Code, so there you would have to add it yourself or leave Sprocket on OpenRouter. OpenRouter keys are per person, set under Settings, and are not server variables. How a person picks who answers is in [Set up Sprocket](/help/agents/sprocket-setup).
