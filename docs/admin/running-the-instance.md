---
title: Run your Taskmanager instance
summary: What the instance admin is responsible for, the ways to host Taskmanager, where its data lives, and how to back up, upgrade and take it offline
requires: instance-admin
topics: instance admin, install, docker, nix, workbench, backup, upgrade, maintenance mode, data, hosting
order: 10
---

You run this instance if you are its instance admin. The first account that signs up on a new instance gets that role, together with an organisation of its own. On an instance that already had users before the role existed, the oldest account became the admin when the server started. The role is checked in the database on every admin request.

As the instance admin you can:

- see every account and give people the right to create organisations: [Users and sign-in](/help/admin/users-and-sign-in)
- choose how people sign in and whether new accounts are allowed
- manage crews: [Crews on your instance](/help/admin/crews-on-your-instance)
- let Sprocket answer through Claude Code and set the server's variables: [Configuration](/help/admin/configuration)

## Ways to host it

**Docker Compose.** Clone the repository and run `docker compose up -d --build`. Compose builds Taskmanager and starts PostgreSQL and RabbitMQ, waits for PostgreSQL, pushes the database schema and starts the app on port 3000. The compose file refuses to start until `RABBITMQ_PASSWORD` is set in `.env`. For anything reachable from the internet, copy `.env.example` to `.env` first and set at least `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` and `ALLOW_SIGN_UP`.

**NixOS.** Add the flake's `nixosModules.default` and enable `services.arnotes`, with `betterAuth.url` set to your public address. The module creates the database and role on the system PostgreSQL, generates the secrets into `/var/lib/arnotes`, pushes the schema and starts the app. Without a NixOS system you can build the packages with `nix build .#default` and `nix build .#schema` and run them yourself.

**Workbench.** On a BigBridge workbench machine, `deploy/workbench/install.sh` runs Taskmanager under supervisord at `http://taskmanager.localhost`, with its own PostgreSQL, and a watcher that deploys every new `master`. The settings file is `/opt/workbench/data/var/lib/taskmanager/env`.

## Put it on the internet properly

- Taskmanager listens on port 3000. Put a reverse proxy with HTTPS in front of it.
- `BETTER_AUTH_URL` must equal the public address exactly, including `https://` and any port. A passkey belongs to its hostname, so changing the hostname makes every existing passkey unusable.
- The live updates run over a WebSocket at `/_ws`. The proxy must pass the `Upgrade` and `Connection` headers. Run one app process: it keeps the connections in memory.
- PostgreSQL is published on `127.0.0.1` only. Do not make it public.

## Where the data is

| What | Docker volume | NixOS |
|---|---|---|
| Accounts, boards, settings | `arnotes_postgres_data` | the system PostgreSQL |
| Attachments, `.auth-secret`, `.secrets-key` | `arnotes_app_data` | `/var/lib/arnotes` |
| GitHub delivery queue | `arnotes_rabbitmq_data` | RabbitMQ's own data directory |

`docker compose down` keeps the volumes. `docker compose down -v` deletes them for good.

`.secrets-key` encrypts every project secret. The database holds the encrypted values and this key opens them. Copy it somewhere apart from the database dump and never change it: a new key cannot read the old secrets.

## Back up

Back up both the database and the application data. The repository documents these commands for Docker:

```bash
docker compose exec -T postgres pg_dump -U arnotes -d arnotes > arnotes.sql
docker run --rm -v arnotes_app_data:/data:ro -v "$PWD":/backup alpine tar czf /backup/arnotes-data.tar.gz -C /data .
```

With an external database, use its own connection details. Keep the files away from the host that runs Taskmanager. On NixOS, back up `/var/lib/arnotes` and run `pg_dump`. The repository does not describe a backup of the RabbitMQ volume. Failed deliveries are recorded in the database.

## Upgrade

Take a backup first. For Docker:

```bash
git pull --ff-only
docker compose up -d --build
docker image prune -f
```

Compose pushes the current schema before the app starts. The repository has no migration files: the schema reaches the database by a push, and the workbench deploy stops with a message when a push would have to ask about a rename or a dropped column. Watch the start with `docker compose logs -f app` and check that `/api/health` answers `ok`. Read `CHANGELOG.md` before upgrading; it carries the upgrade notes.

On the workbench, a deploy builds next to the running release, backs up the database (the last ten dumps are kept), switches over, and goes back by itself if the new release does not answer within two minutes.

## Maintenance mode

Set `MAINTENANCE_MODE` to `1`, `true`, `yes` or `on`, or create a file called `maintenance.on` in the server's working directory, and every request is answered 503 with `Retry-After`: a small page for browsers and JSON for the API. `/api/health` still answers. Due-date rules pause too. The file needs no restart, so `touch maintenance.on` before a deploy and `rm maintenance.on` after. `MAINTENANCE_FILE` renames the file.
