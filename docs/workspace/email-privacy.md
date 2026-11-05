---
title: Who can see your email address
summary: Your email address is private by default. A five-step slider in Settings decides who else may see it, and where it shows up
topics: email, privacy, address, gdpr, slider, visibility, who can see my email, members, guests, person card
order: 115
---

Your email address belongs to you. By default **nobody else on the instance sees it**: teammates, guests, customer
contacts and team owners see your name, not your address. You can let more people see it, one step at a time, with a
slider in **Settings**.

## The slider

Open **Settings** (from your name at the bottom of the sidebar). The section **Who can see my email address** has a
slider with five steps. Each step includes everyone from the steps before it.

| Step | Who sees your address |
|---|---|
| **Only me** (the default) | You. |
| **Managers** | Also the people who manage a board or a team you are on: team owners and admins, and on a board's own lists the board's project managers. |
| **Team members** | Also everyone in a team you are in. |
| **Guests** | Also everyone who shares a board with you: guests and customer contacts included. |
| **Everyone** | Also every signed-in person who sees you listed or opens your card. |

The change is saved when you let go of the slider, and a message confirms the step. If saving fails, the slider goes
back to where it was.

You always see your own address, whatever the step.

## Where the setting applies

The same rule decides every place that shows someone else's address:

- the **Members** page of a team,
- a board's list of people, its **Members** settings and the assignee picker,
- the guests listed in the **Share** dialog,
- the person card and the profile page,
- the owner shown on a key in the team's **Keys** list,
- the contacts of a customer.

Where the rule hides an address, the row shows the name alone. Nothing else changes: you can still be assigned a task,
mentioned or invited.

## What the slider does not cover

- **An address someone typed themselves.** When a team owner or a board admin invites `sam@example.com`, that address
  is listed on the invitation they sent, to them and to the people who may manage invitations. They typed it, so they
  already know it. It says nothing about the account that later accepts.
- **The instance admin's Users list.** The admin page that hands out rights lists every account with its address, so
  the admin can tell accounts apart.
- **Mail sent to you.** Notification and invitation mail still goes to your address.
- **Who finds you.** The slider decides whether an address shows. It does not make you searchable. The person card
  and profile still answer only for people you share a board with.

## What is easy to get wrong

- **A teammate who cannot see your address is not a bug.** The default is the narrowest step on purpose. If you want
  your team to reach you by email, move the slider to **Team members**.
- **Managers means more than one team.** If you are on two teams, an owner or admin of either sees your address at the
  **Managers** step.
- **Moving the slider back takes effect at once.** Nothing is cached on other people's screens beyond the page they
  already have open. Their next reload no longer shows the address.
