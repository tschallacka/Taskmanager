---
document: privacy
title: Privacy Policy
version: 1.0.0
effective: 2026-11-15
changed: 2026-11-15
language: en
status: draft
---

# Privacy Policy

**Taskmanager**, `https://taskmanager.tschallacka.dev`

Version 1.0.0 · in force since 15 November 2026 · last changed 15 November 2026

Earlier versions stay available: see [Version history](#16-version-history) at the end of this page and the archive of privacy policies.

This policy says which personal data Taskmanager processes, why, on what legal basis, who receives it, how long it is kept, and what rights you have. It is written for the General Data Protection Regulation (GDPR, Regulation (EU) 2016/679) and the German data protection rules that apply next to it. It describes how the service works today. If the service changes in a way that affects your data, this policy changes first (see section 15).

## 1. Who is responsible

The controller in the sense of Article 4(7) GDPR is:

Michael Dibbets
Baegertstrasse 28a
47533 Kleve
Germany

Email: tschallacka@outlook.com

The controller is a private person. There is no company behind the service and no data protection officer; none is required by law for this scale of processing. Questions about your data, requests under section 11 and reports of problems go to the email address above.

### Teams and the content of workspaces

Taskmanager is used in teams. What a team stores in its boards (tasks, comments, files, customer names and so on) is decided by the people who use it. If you use Taskmanager for your own business or organisation, you are responsible under data protection law for the personal data of third parties that you put into your workspace (for example your customers' contact people). For that content I act on your behalf as a processor. If you need a data processing agreement under Article 28 GDPR, write to the address above and I will provide one.

## 2. What Taskmanager is

Taskmanager is a web application for planning and tracking work: boards, tasks, comments, time tracking, customers and guests who may follow selected work, notifications, and optional connections to GitHub, sign-in providers and an AI assistant. You can use it after creating an account or after being invited by a team or a board.

## 3. Data we process, why, and on what basis

For each purpose the lists below say what is processed. "Legal basis" refers to Article 6(1) GDPR.

### 3.1 Your account and signing in

Purpose: to create your account, recognise you when you come back and keep your account secure.

Data: your name; your email address and whether it is verified; a password stored only as a salted hash (never the password itself); an optional profile picture (an address of an image, or one reported by your sign-in provider); the setting that decides who may see your email address (by default only you); whether two-factor authentication is on, with its secret and backup codes; passkeys (a name you gave, the public key, the credential identifier, the kind of device and whether it is backed up, never the private key); the date the account was created and last changed.

When you sign in with Google, GitHub, Discord or another OpenID Connect provider: your provider's account identifier, the provider name, the permissions granted, the tokens the provider issued to Taskmanager, and the name, email address and picture the provider reports.

Sessions: for every signed-in browser a random session token, its expiry, the time of creation, the IP address and the browser description (user agent) seen when the session started, and the team that is active.

Legal basis: Article 6(1)(b) (performing the service you asked for) and, for security measures such as session handling and abuse protection, Article 6(1)(f) (my legitimate interest in a secure service).

### 3.2 Teams, invitations, customers and guests

Purpose: to let people work together and to let selected outsiders follow selected work.

Data: the teams you belong to and your role in them; invitations (the invited email address, the role, the inviter, the dates, and only a hash of the invitation link, never the link itself); customer records (a customer name) and the people attached to them; guests of a single board (the account, role, optional allowed email domain); who added whom and when.

Legal basis: Article 6(1)(b); for the team owner's own decisions about who joins, the team's responsibility under section 1.

### 3.3 The work itself

Purpose: the core function of the service.

Data: what you and your team enter: projects and boards, columns, tasks, descriptions, labels, due dates, custom fields, comments and replies (with a visibility: internal or shared with customers), messages, status updates, goals and portfolios, rules, links to GitHub items, task dependencies, files attached to tasks (stored on the server's disk), time entries (minutes, day, an optional note) and running timers, pinned boards, and an activity history that records who changed what and when. Project secrets that a project manager stores for the project are stored encrypted. Notifications (type, title and short text, who caused it, read and archived state) and your notification settings.

Legal basis: Article 6(1)(b).

### 3.4 Email and push messages

Purpose: to send you what you asked for.

Data: your email address and the message text. Taskmanager sends sign-in codes (if you use the email code sign-in), invitations, confirmations of extra email addresses that you add, and notification emails if you turned them on. If you turn on browser push notifications, your browser's push subscription (an address at the browser vendor's push service, two keys, your browser description, the creation time and the time of the last message) is stored so that a message can be delivered.

Legal basis: Article 6(1)(b); push messages and optional emails only after you switch them on, so also Article 6(1)(a) (your consent), which you can withdraw at any time in your settings.

### 3.5 Keys, agents and automation

Purpose: to let you connect tools (for example an AI agent through the MCP interface) to your boards without giving them your password.

Data: for each key its name, scopes, the boards it may reach, creation, last use and expiry, and a hash of the key (the key itself is shown to you once and not stored in a readable form); pairing codes used to hand a key to a tool; a record of what a key did on your boards (the tool, the task and board titles it touched and a short summary), kept for 90 days. For crews of automated team members, a record of refused or blocked calls (time, sender address, method, path, outcome; never the key), kept for 90 days.

Legal basis: Article 6(1)(b) for the keys; Article 6(1)(f) (security and traceability) for the records.

### 3.6 The AI assistant (optional)

Purpose: writing help and the assistant ("Sprocket") when you choose to use it.

Nothing is sent to an AI service unless you use an AI function. If you do, the text you selected or typed, the context that function needs (for example the title of your task) and your instruction are sent to the AI service you or the instance operator configured. By default that is OpenRouter (`openrouter.ai`, United States), which passes the request to the model provider you picked. You can supply your own OpenRouter key in your settings; it is stored for you in your account settings. If you use the assistant through a connected agent key, the request goes to that agent's provider instead.

What Taskmanager keeps itself: a usage record (time, the kind of action, the model name and the number of tokens used) so that fair-use limits can be applied. The text you sent is not kept in these records.

The AI services act under their own terms, which you should read before use: [OpenRouter](https://openrouter.ai/privacy). Their answers are suggestions; no decision about you is made by them (section 12).

Legal basis: Article 6(1)(b) (you asked for the function) and Article 6(1)(a) where you supply your own key.

### 3.7 Connections to GitHub (optional)

Purpose: to show and sync GitHub issues, pull requests and branches next to tasks, when a team connects a repository.

Data: the repository names the team connects, the linked issue and pull request items (titles, state, labels, comments and checks as shown on the task), a cache of the answers from GitHub, and records of deliveries that GitHub sends to Taskmanager. Content of failed deliveries is stored for at most 30 days; the record that a delivery failed stays. If you sign in with GitHub, section 3.1 applies.

Legal basis: Article 6(1)(b).

### 3.8 Technical data and security

Purpose: to keep the service running and safe.

Data: the web server writes access logs (time, IP address, requested address, answer code, size and browser description) for each request; [[LOG-RETENTION: the number of days the web server logs are kept]]. The application keeps short-lived counters per sender and function to limit abuse (rate limits); these are deleted after their time window has passed.

Legal basis: Article 6(1)(f): my legitimate interest in the operation and security of the service.

## 4. Cookies and similar storage in your browser

Taskmanager uses only what is technically necessary for the function you asked for. There are no advertising, analytics or tracking cookies, and no third-party trackers. Because of this no cookie banner is needed (section 25(2) of the TDDDG, the German telecommunications and digital services privacy act).

| What | Why | How long |
|---|---|---|
| Session cookie (set by the sign-in system after you sign in; `HttpOnly`, `Secure`, `SameSite=Lax`) | Keeps you signed in | Up to 7 days, renewed while you use the service; deleted when you sign out |
| Invitation cookie (set when you open an invitation link) | Remembers the invitation while you sign up or sign in | 24 hours |
| Browser local storage | Remembers display choices on this device: whether the sidebar is collapsed, the last view you used on a board, the folder name of a crew home | Until you clear your browser data |
| Browser session storage | Keeps an open assistant conversation | Until you close the tab |

## 5. Resources your browser loads from other servers

To draw some of its icons the application's page may ask the public icon service Iconify (`api.iconify.design`) for icon files. When it does, Iconify's servers receive your IP address, the time and the names of the icons. No other content from other servers is loaded: fonts, scripts and the remaining icons come from the service's own server. The legal basis is Article 6(1)(f) (displaying the application's interface). If this changes, this section changes with it.

## 6. Who receives your data

- **Other people in your teams and boards.** Colleagues see what you share with them: your name and profile picture, and your email address only if you allowed that in your settings. Customers and guests see only what is shared with them. The controller can technically access all data stored on the server for operation, support and security; that does not include secrets of project managers, which are stored encrypted.
- **Hosting.** The server is operated at [[HOSTING: name and country of the hosting provider]]. The provider processes data on my behalf under a data processing agreement.
- **Email delivery.** If emails are sent, they are handed to [[EMAIL-SERVICE: name and country of the email service, or "the server's own mail system"]] for delivery.
- **Push services.** If you turn on push notifications, the message goes through the push service of your browser's maker (for example Google, Mozilla or Apple).
- **Sign-in providers**, when you choose them: Google, GitHub (Microsoft), Discord, or the OpenID Connect provider named on the sign-in page. They learn that you signed in to Taskmanager and when; they do not receive your boards, tasks or comments.
- **AI services** if you use them (section 3.6) and **GitHub** if a team connects a repository (section 3.7).
- **Authorities and courts** where the law requires me to disclose data.

I do not sell your data and I do not use it for advertising.

## 7. Transfers outside the European Economic Area

Some of the services above are operated from the United States: OpenRouter and the model providers behind it, Google, GitHub, Discord and push services of some browser makers. Where data is transferred to such a provider, this happens on the basis of the EU–US Data Privacy Framework (adequacy decision of 10 July 2023) where the provider is certified under it, and otherwise on standard contractual clauses (Article 46(2)(c) GDPR). You can avoid these transfers by not using the corresponding function: signing in with a password or a passkey, not using the AI functions and not connecting GitHub.

## 8. How long data is kept

| Data | Kept |
|---|---|
| Account and profile data | Until you ask for deletion or the account is removed |
| Your content in a team workspace (tasks, comments, files, time entries) | As long as the team keeps it; deleting a task moves it to the trash, where it can be restored for a while, and it is removed from there afterwards |
| Sessions | Until they expire (up to 7 days after last use) or you sign out |
| Invitations | Until used, revoked or expired |
| Key and agent activity records, blocked-call records | 90 days |
| Stored content of failed GitHub deliveries | 30 days |
| Rate-limit counters | Minutes to hours, until their window has passed |
| Web server access logs | [[LOG-RETENTION: days]] |
| Backups | [[BACKUP-RETENTION: days]]; data deleted from the live service disappears from backups when they are replaced |
| Emails I receive from you | As long as needed to answer, then deleted unless the law requires me to keep them |

Data that I must keep for legal reasons (for example tax or commercial records, if any ever arise) is kept for the legal period and blocked from other use.

## 9. Security

The connection to the service is encrypted (HTTPS). Passwords are stored only as salted hashes, keys and invitation links only as hashes, project secrets encrypted. Access to the server is limited to me. No system is perfectly secure; if a breach affects your data in a way that carries a risk for you I will report it to the supervisory authority within 72 hours as the law requires and tell you without undue delay where the risk is high.

## 10. Obligation to provide data

You do not have to use Taskmanager. To use it you must give a name and an email address (or sign in through a provider that reports them); without them I cannot create an account. All other data is entered by you or your team as you wish.

## 11. Your rights

Under the GDPR you have the right to:

- **Access** (Article 15): to know whether I process your data and to receive a copy;
- **Correction** (Article 16) of data that is wrong, which you can mostly do yourself in your settings;
- **Erasure** (Article 17), "the right to be forgotten", where the conditions of the law are met;
- **Restriction** of processing (Article 18);
- **Data portability** (Article 20): to receive the data you provided in a common machine-readable form;
- **Objection** (Article 21) to processing that rests on my legitimate interest, for reasons that arise from your particular situation;
- **Withdrawal of consent** (Article 7(3)) at any time for things that rest on your consent, with effect for the future.

Today there is no button in the settings for deleting an account or downloading all your data. To use these rights write to **tschallacka@outlook.com** from the address of your account, say what you want, and I will answer within one month (Article 12(3) GDPR). I may ask you to prove that the request comes from you.

**Complaints.** You have the right to complain to a data protection authority (Article 77 GDPR). The authority responsible for me is the *Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen*, Kavalleriestraße 2–4, 40213 Düsseldorf, Germany, `https://www.ldi.nrw.de`. You may also complain to the authority of the country where you live or work.

## 12. No automated decisions

No decision that has legal or similarly significant effect on you is made by automated means, and there is no profiling. The AI functions produce suggestions that you read and decide on yourself.

## 13. Children

Taskmanager is not meant for people under 16 and I do not knowingly process their data. If you believe a child has an account, write to me and I will remove it.

## 14. Links to other sites

Links to other sites (for example GitHub or the privacy policies named above) lead outside Taskmanager. I am not responsible for the content or the data handling of those sites.

## 15. Changes to this policy

I change this policy when the service, the law or the way I handle data changes. Every version has a number, an effective date and a short note of what changed (section 16). When a change matters for your data you will see a notice in the service or receive an email before it takes effect. Earlier versions are not deleted: they stay readable in the archive of privacy policies, with the dates on which each was in force, so that you can see what applied at any past time.

## 16. Version history

| Version | In force from | What changed |
|---|---|---|
| 1.0.0 | 15 November 2026 | First version |
