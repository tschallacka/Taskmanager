---
title: Create or join a team
summary: Start a team, join one with a join code, and find or rotate the code
requires: staff
topics: create team, join team, join code, team code, rotate code, invite people, new team
order: 20
---

There are two ways into a team: you start one, or you join one with a **join code** that someone in the team
gives you. Starting a team is a right the instance admin hands out; joining is open to anyone who is signed in
and has a valid code.

## Join a team with a code

1. Ask someone in the team for the join code. Any member can read it on the Team page (see below).
2. Click the workspace button at the bottom of the sidebar (above your name) and choose **Join a team with a code**. If you cannot
   create teams, the menu also shows a **Join a team with a code** link in its hint text.
3. Type or paste the code into **Team Code** and click **Join a team with a code**.

The code is 16 letters and digits, never I, L, O, 0 or 1. Capitals, spaces and dashes do not matter:
`k3f9-qx7b m2h8 yrwz` works the same as `K3F9QX7BM2H8YRWZ`.

When it works, you become a **member** of the team and the team becomes your active workspace. Joining always
makes you a member, whatever the code's owner intended. If you were already in the team, nothing changes.

If it does not work you see "That code is not valid. Ask the team owner for a new one." The usual cause is a
code that was rotated since it was given to you (see below). The code stays in the field so you can correct a
typo without retyping it. Any other message ("Could not join. Try again.") means the join failed for another
reason: the server could not be reached, or your account may not join teams (a crew account can only be in its
own crew's team).

## Create a team

You only see **Create Team** in the workspace menu if the instance admin has allowed you to create teams. Without
that right the menu says "Teams are created by an admin" and the server refuses the request too.

1. Open the workspace menu and choose **Create Team**.
2. Enter a **Team Name**, for example "Acme Engineering", and click **Create Team**.

You become the team's **owner**, the new team becomes your active workspace, and it gets a join code right away.
You can rename the team later under **Team**, then **General**.

## Where the join code is

Open **Team**, then **General**. The code is shown under **Team join code**, with a **Copy Code** button. Every
member of the team sees the code and can copy it. Anyone who is signed in and has the code can join, so share it
only with people you want in the team, and every board of the team is open to them as soon as they join.

If the team has no code yet, it says "No code yet".

<!-- requires: team-admin -->
## Generate or rotate the code

As an owner or admin you control the code:

- **Generate Code** appears when the team has no code yet. Click it to make one.
- **Rotate** replaces the code. A confirmation asks "Rotate join code?" and warns that the current code stops
  working immediately. Click **Rotate** to confirm.

Rotating does not remove anyone who has already joined. It only closes the door for people who still hold the old
code. Rotate when a code was shared too widely, or after you have onboarded the people you expected.

The new code is not sent to anyone. Copy it and pass it on yourself.

Removing someone from the team is a separate step: see
[Leave, remove, transfer or delete](/help/team/leave-remove-transfer-delete).
<!-- /requires -->

<!-- requires: instance-admin -->
## Allow someone to create teams

As the instance admin you decide who may create teams.

1. Open the workspace menu and choose **Accounts on this instance**.
2. Switch on **Can create organisations** for the person.

The dialog says "organisations" where the rest of the app says teams; they are the same thing. Taking the right
away again leaves the teams a person already owns in place.
<!-- /requires -->

## What is easy to get wrong

- **A join code is not an invitation to one person.** Anyone who has it can use it, as often as they like, until
  it is rotated. To invite an outside party to follow one project, use a customer link instead; see
  [Customers and contacts](/help/team/customers-and-contacts).
- **You cannot pick a role when joining.** Everyone joins as a member. See
  [Members and roles](/help/team/members-and-roles).
- **Crew accounts** (accounts made for an agent crew) can only be in their own crew's team, so a join code for any
  other team is refused for them.
