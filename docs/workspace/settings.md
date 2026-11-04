---
title: Settings
summary: What each section of your Settings page is for: your account, security, appearance, API keys and AI
topics: settings, account, security, passkey, two-factor, appearance, theme, dark mode, accent color, sign out, ai history
order: 110
---

**Settings** holds what belongs to you as a person, not to a project or a team. Open it from your name at the bottom
of the sidebar, then **Settings**. On a phone, the **Back to boards** button at the bottom returns you to your
projects.

Across the top of the page are two buttons: **Sprocket** (the assistant's own settings) and **AI history**.

<!-- requires: instance-admin -->
Because you run the instance, you also have a **Crews** button there.
<!-- /requires -->

The sections below are in the order they appear.

## Your stats

Two numbers about the built-in AI features: how many **AI prompts** you have sent, and how much **AI spent** in dollars.
**AI history** at the top opens the full list: each prompt with its action, model, tokens used and cost, and the
totals.

## Account

Your picture, name and email, and **Member since** with the month and year you joined. **Sign out** ends your session
on this device.

This section only shows these details: it has no field for changing your name or picture. The **Profile** page links
here with **Edit profile in settings**, and that link opens this page.

## Security

Two ways to protect how you sign in:

- **Passkeys**: sign in with Touch ID, Windows Hello, your phone or a security key instead of a password. Give a
  passkey a name, such as the device it lives on, and press **Add passkey**. Each passkey is listed with whether it is
  synced across devices or only on one, and when it was added, and can be removed. This part only appears when the
  server has passkeys turned on.
- **Two-factor authentication**: sign in with a code from an authenticator app as well as your password. You confirm
  your password to start, scan the code with an app such as Google Authenticator, Bitwarden or 1Password, and type the
  code it shows to turn it on. You also get **backup codes**: each one signs you in once if you lose your
  authenticator, and they are **not shown again**, so store them somewhere safe. Once it is on, you can **Add another
  app**, make **New backup codes**, or **Turn off** two-factor, each of which asks for your password.

If a step fails you see a message such as **That code did not match**. Nothing is turned on until the code you type
matches.

## Appearance

- **Theme**: a button switches between **Light mode** and **Dark mode**. The same switch is in the account menu at the
  bottom of the sidebar.
- **Accent color**: the colour of buttons, highlights and other interactive parts. Click a swatch.
- **Neutral color**: the colour of backgrounds, borders and text. Click a swatch.

The two colours are saved to your account through the server. The light or dark choice is kept by your browser.

## API keys and MCP

A panel for the keys that let an AI agent or script work with your boards on your behalf, with the settings for
connecting an agent over MCP. Keys belong to the workspace you have open, so switching workspace shows a different set.
Each key has a name, the permissions you give it (read boards, write boards, and so on) and an expiry. A new key is
shown **once**: copy it when you make it, because it cannot be shown again.

Keys and agents are explained in full in [API keys, permissions and reach](/help/agents/api-keys).

## AI (OpenRouter)

The AI chat panel and the AI actions in the editor use a model through OpenRouter, which needs your own key.

- **API key**: paste your OpenRouter key and press **Save**. Only a masked form is shown afterwards. **Remove** deletes
  it. Without a key, the chat asks you to add one and the editor shows a message and stops.
- **Model**: pick a model from the list, which shows the context size and the price per million tokens for input and
  output, or type any OpenRouter model name and press Enter. **Active** shows which one is used.
- The refresh button next to the key reloads the model list and prices from OpenRouter.

**Sprocket** can instead answer through Claude Code as one of your agents: the **Sprocket** button at the top opens
those settings. What Sprocket is and what it may do is on [Sprocket, the built-in assistant](/help/agents/sprocket).
