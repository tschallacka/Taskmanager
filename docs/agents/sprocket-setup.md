---
title: Set up Sprocket
summary: Choose who answers as Sprocket, pick its agent key, model and effort, and fix the usual messages
topics: sprocket, openrouter, claude code, model, effort, agent, setup, settings, api key
order: 100
---

Sprocket needs something to answer with. You choose it under **Settings**, then the **Sprocket** button at the top
right. This page is for setting that up. To know what Sprocket is and what it may do, read
[Sprocket, the built-in assistant](/help/agents/sprocket).

The first panel, **Who answers as Sprocket**, shows two cards: **OpenRouter** and **Claude Code**. The one with the
coloured border is in use. Pressing the other one switches at once.

## Answer with OpenRouter

OpenRouter gives you a choice of many models, and you pay per token with your own account.

1. Make a key at openrouter.ai (the link is in **Settings**, in the panel **AI (OpenRouter)**).
2. In **Settings**, panel **AI (OpenRouter)**, paste it into **API key** and press **Save**. Taskmanager shows only a
   masked copy afterwards. **Remove** deletes it.
3. Under **Model**, search the list and pick one. It shows the context length and the price per million input and
   output tokens, so you can compare before you choose. You can also type any OpenRouter model name and press Enter.
   The small refresh icon beside **API key** reloads the list and prices.
4. Under **Settings**, then **Sprocket**, press the **OpenRouter** card if it is not already in use.

Without a key, the chat panel says "No OpenRouter API key yet" and offers a button to Sprocket's settings.

Sprocket then sees and changes what you can in the app, as you, on the server. There is nothing to pick on the
Sprocket page beyond the card. If the server admin has turned on the instance's key, you need no key at all: see
[Sprocket with the server's key](#sprocket-with-the-servers-key) below.

<!-- requires: instance-admin -->
## Answer with Claude Code

As instance admin you may let Claude Code answer. It runs on the server where Taskmanager runs, with that server's Claude
Code login. The **Claude Code** card is greyed out until Claude Code is installed where the server runs. The card says
so when it is not.

1. Under **Settings**, then **Sprocket**, press the **Claude Code** card. A new panel, **Claude Code**, appears.
2. Under **Model**, pick an alias or type a full model name and press Enter. The aliases are `haiku`, `sonnet`, `opus`
   and `fable`: each means Claude Code's newest model of that kind. The default is `haiku`.
3. Under **Effort**, choose how hard the model thinks before it answers: **Claude Code default**, or `low`, `medium`,
   `high`, `xhigh` or `max`. Lower is quicker.

Each change is saved as you make it.

The agent key you may have picked here before no longer decides what Sprocket reaches. Each run acts as you, with what
you may open at that moment, as described under [Sprocket, the built-in assistant](/help/agents/sprocket).

### What each run does

For every message, the server starts Claude Code once, with the model and effort you chose. It gives that run the
Taskmanager tools and nothing else: Claude Code's own tools for files, commands and the web are switched off, and no
settings or project instructions are read. The run signs in with a temporary key that stands for you alone, holds
nothing stored, lasts at most 15 minutes and is thrown away when the run ends. A run that takes longer than ten minutes
is stopped.

### On the server

- **Claude Code is not found.** Set `SPROCKET_CLAUDE_BIN` to its path. Without that the server looks in the usual places
  and on its `PATH`.
- **Everyone may use it.** By default only the instance admin may. Setting `SPROCKET_CLAUDE_FOR_ALL=true` lets every
  person with an account pick Claude Code for themselves. It then runs on the server's single Claude Code login, whoever
  asks.
- **The server cannot reach itself.** The run calls back to this server's own `/api/mcp` on the same machine. If that
  is not the address the server can use for itself, set `SPROCKET_MCP_URL`.

### Messages you may meet

- *Claude Code is not installed where this server runs.* See above.
- *Claude Code took longer than ten minutes and was stopped.* Ask something smaller, or pick a quicker model or lower effort.
<!-- /requires -->

## The "Connect an agent" block

Lower down the Sprocket settings page is a block, **Connect an agent**, with copy buttons for connecting a Claude Code
of your own. It is not part of Sprocket: each Sprocket run has a key of its own. To connect your own, follow
[Connect Claude Code to your boards](/help/agents/connect-claude-code).

## A good setup

Sprocket needs no key of its own. Its work shows in the [agent audit](/help/agents/agent-audit) under your name and
as Sprocket.

## Sprocket with the server's key

The server admin may set one OpenRouter key for the whole instance, so that every signed-in person can use Sprocket
without making a key. Then:

- Your own OpenRouter key always answers you, if you have one.
- Without one, the instance's key answers you, on the model the admin chose (default `openai/gpt-4o-mini`).
- Each of your messages on the instance's key counts against a daily limit. Your own key's messages do not count. When
  you have used the limit for the day, Sprocket tells you when it resets (midnight UTC).

**Settings**, then **Sprocket** says which one answers you: *your own key*, *the instance's key*, or *Claude Code*.

## Its manner

Under **Settings**, then **Sprocket**, choose how Sprocket sounds: Professional (the default), Friendly, Concise,
Playful or Teacher. Each choice has a one-line sample on the page. Your choice wins over the server's default. The
manner changes only the tone of answers.
