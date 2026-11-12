---
title: Set up a crew in one go
summary: Let an AI agent make a new crew for one of your boards, with one prompt and one command
requires: team-admin
topics: crew, set up, management token, AI agent, kit, one go
order: 31
---

An AI agent can make a new crew for a board in one go. You give it one prompt, and it downloads the crew kit from this
Taskmanager, makes the crew for the board, and reports where the crew's files are. You never see a key on screen.

You need to be an **owner or admin** of the team, and the instance admin must allow crews. If crews are off, the
prompt says so in one sentence instead of making a call that fails later.

## Steps

1. Open the board's menu and choose **Add a crew to this board**. (The window opens for that board.)
2. Copy the prompt the window shows. It holds a management token that works for **10 minutes** and for this board only.
3. Paste the prompt into an AI agent on the computer that will run the crew. Answer its one question: the path of the
   repository the crew works on.
4. When the agent is done, it reports three lines: where the crew's files are, the crew's work board address, and what
   to do next. Open the work board to see the crew there.

## Good to know

- The token is for remote calls to the crew API, and it is the only key that works there. A **crews:manage** key does
  not work for remote calls: use the management token.
- Each run makes a **new** crew. If the name is taken, the agent picks another name. Nothing is rotated.
- The keys go straight into the crew's own folder, and the agent never shows them.
- When the 10 minutes are over, the token stops. Make a new one from the same window for a new run.
