---
title: Instance settings
summary: The one page for everything instance-wide: Sprocket for everyone, the app name and logo, and links to accounts, crews and the configuration help
requires: instance-admin
topics: instance settings, gear, sprocket, openrouter key, daily limit, claude code, branding, logo, app name, accounts, crews
order: 25
---

Instance settings holds what applies to everyone on this Taskmanager. Only the instance admin sees the gear next to the
logo at the top of the sidebar, and only the instance admin can open the page. Anyone else who types its address gets
the normal "page not found".

Open it with the gear, or at `/admin/settings`.

## Sprocket for everyone

Sprocket is the assistant in the chat panel. Here you set it up once for the whole instance.

- **Provider.** OpenRouter. A user who set their own Sprocket keeps it; the instance key only answers those who have none.
- **Model.** The OpenRouter model id, `openai/gpt-4o-mini` by default. Save it after you change it.
- **OpenRouter key.** The instance's key. It is stored encrypted with `SECRETS_ENCRYPTION_KEY` and is never sent to a
  browser: the page shows its last four characters, and nothing else returns it. Paste a new key to replace it, and
  remove it to take it away. The first key you save turns **Sprocket for everyone** on.
- **Sprocket for everyone.** When it is on, every signed-in user gets Sprocket on the instance key. Turn it off to stop
  that without removing the key.
- **Messages per user per day** (default 200) and **messages per day for the whole instance** (default 2000). A user who
  reaches the first gets a plain message: the free messages for today are used up, when they come back, and a button to
  set up their own Sprocket. A user with their own key is never counted and never sees that message. The instance count
  stops everyone at once.
- **Default manner.** How Sprocket speaks when a user has not picked one: Professional, Friendly, Concise, Playful or
  Teacher. A user's own pick always wins. The manner changes only the tone, never what Sprocket may do.
- **Claude Code for everyone.** Off by default. When on, every user may choose Claude Code, which runs on this server's
  own Claude login. If the server's environment sets `SPROCKET_CLAUDE_FOR_ALL`, that setting decides and the switch is
  locked.

Sprocket acts as the user who asks, with that user's own reach. It never reads project secrets, keys, passwords or
sessions, and a customer contact's Sprocket sees only the customer's view. The page does not change any of that.

## Branding

- **App name.** Shown next to the logo in the sidebar and on the login page. Up to 40 characters. Empty, or **Reset
  name**, brings back "Taskmanager".
- **Logo.** Upload an SVG of at most 100 KB. The file is checked before it is saved: scripts, embedded pages, event
  handlers, and links to other files or sites are refused. **Reset logo** brings back the logo that ships with the app.

## Links

- **Accounts on this instance** opens the list of accounts, where the admin can make someone an instance admin.
- **Crews** opens the crews page.
- **Configuration help** opens the page that lists the server's environment variables.

## What the page does not do

It does not change the server's environment variables. Those are set where the server is run, and the configuration help
page lists them.
