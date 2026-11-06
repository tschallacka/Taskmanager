# The office: what happens when the board changes

The office view (`/office/<board id>`, or the **Office** button on a board) draws a crew's board as an office
floor. Every task is a folder. The board decides where each folder ends up; the office decides who walks it
there and what they do on the way. Nothing in the office writes to the board.

The page polls `GET /api/projects/<id>/office` every three seconds. Each answer is compared with the one
before (`errandsBetween` in `model.ts`), and every folder that changed place becomes one *errand*: a
courier walks to the folder, picks it up, carries it to its new place and drops it. `/office/demo`, and the
**Demo** button, play the script in `demo.ts` instead of a live board, so every scene below can be watched
without a crew at work.

## Who sits where

| Who | Where | Comes from |
|---|---|---|
| Pia (project manager) | The desk in the middle, with a BACKLOG and a VERIFY PM tray | key `pia` |
| Wren, Wick, Wynn, Wade (workers) | Row A cubicles against the back wall, a TODO tray at each opening | keys `wren` … `wade` |
| Usher (UX), Nina (code), Quincy (QA) | Row B cubicles, a VERIFY tray at each opening; a sign on the back partition, facing the room ("NINA · CODE REVIEWER") | keys `usher`, `nina`, `quincy` |
| Cato, the Boss | The glass office on the right, a VERIFY inbox on the desk, a putting green by the window | key `boss` or `cato` |
| Anyone else a task is assigned to | A spare cubicle, as a worker | any other account |
| The courier | Out in the street, behind the DELIVERIES door; only comes in with a parcel | not on the board |

On a crew's shadow board the people are the members forked for that board. On a crew's own board they are
the crew's accounts. The customer logins never get a desk. A board without a Pia or a Boss gets a stand-in
of each (Pia Planner and Cato), so there is always someone to hand out and someone to sign off.

The tag over each head is the first name. The role is printed across the shoulders of each shirt: PM,
WORKER, UX, CQ, QA, BOSS, COURIER. Every tray is labelled front and back, so the labels read from the aisle;
the pillar a tray stands on is left plain.

Each desk carries two personal things of its owner: Pia a calendar and a photo, Wren soda cans and a figure,
Wick a toolbox and a photo, Wynn a lava lamp and sticky notes, Wade mugs and a Rubik's cube, Usher sticky
notes and a cactus, Nina a pencil cup and a globe, Quincy a trophy and a stress ball, Cato a nameplate and a
golf trophy. Anyone else gets two picked by their name, the same two every time.

## Where a folder lies

| Column | Folder lies in |
|---|---|
| Backlog, and any column the office does not know | Pia's BACKLOG tray |
| To do, assigned to a worker | That worker's TODO tray |
| In progress, assigned to a worker | On that worker's desk |
| To do or In progress with nobody (or Pia) assigned | Pia's BACKLOG tray |
| Verify PM | Pia's VERIFY PM tray |
| Verify UX / CQ / QA | Usher's, Nina's or Quincy's tray (Pia's VERIFY PM tray when that reviewer is missing) |
| Verify | The Boss's inbox |
| Ready for live | The rocket pad |
| Done | On top of the archive cabinet |
| Blocked | The blocked shelf, under the siren |
| Bugs | Inside the bug jar |

## The scenes

Each scene is one errand. Who carries the folder follows two rules. The person whose spot the folder lies in
carries it out. Pia carries everything out of her own trays and out of the shared fixtures, and she also fetches
a folder that moves from one worker to another, because who does what is her call.

**New tasks arrive.** A courier in a brown cap walks in through the DELIVERIES door in the right wall with
a cardboard parcel and brings it to the Boss's office ("📦 delivery for the Boss! 3 folders"). Every task
that reaches the board before the courier reaches the Boss goes into that same parcel; anything later starts
the next one. The Boss comes round his desk to sign for it ("sign here ✍️"), cuts it open (✂️, a puff of
packing peanuts) and walks the armful of folders to where the board filed them: Pia's backlog first, then
any worker's TODO tray or fixture a task went straight into. Pia says "📥 thanks boss", or "😱 all of
these?" with a facepalm when he drops more than two. The courier leaves through the same door, or stays in
sight when the next parcel is already waiting.

**Pia assigns a task.** Pia gets up, picks the folder out of her backlog (📋), walks the aisles to the
worker's cubicle and drops it in the TODO tray. If the worker is dozing she knocks on the partition ("knock
knock!"), the worker jumps awake (❗) and waves a 👍 once the folder is in.

**A worker starts.** The worker gets up, takes the folder from the TODO tray to the desk (💪) and sits
down to work. Each worker has a habit, and switches between a few moves every six to twelve seconds:

| Worker | Works by |
|---|---|
| Wren | Frantic typing, coloured keys flying off the keyboard, now and then ⌨️🔥 |
| Wick | A hammer: a slow wind-up, then BONK on the keyboard, with sparks and a shaking monitor |
| Wynn | Talking it through with the rubber duck on the desk (🦆?, 💡), sometimes a wrench |
| Wade | Typing between sips of coffee, and the occasional full spin in the chair ("wheee") |
| Anyone else | A random mix of the above |

The monitor shows the task's title and scrolling code, and now and then flashes BUILD FAILED or TESTS PASS.

**A worker puts a task back in To do.** The worker carries it from the desk back into their own tray.

**A worker hands in.** The worker walks the folder to the front of Pia's desk and drops it in VERIFY PM
(✅). Pia looks up (👀), or gets knocked awake first.

**Review passes it on.** Every gate hands the folder back to Pia, and only she sends it on, as the crew's
rules say: Pia carries it to Usher (when something a person sees changed), Usher carries it back to Pia, Pia
takes it to Nina, Nina brings it back, Pia takes it to Quincy, Quincy brings it back, and Pia takes it to the
Boss (👉). The receiver squints at it (🧐). Usher sweeps a magnifying glass over it, Nina scribbles with a red
pen ("nit:", "why?"), Quincy brings a stamp down (✅ or ❌), the Boss leans back and reads with both hands
(📈, 💰). A reviewer never hands a folder to another reviewer.

**A review sends it back.** A reviewer's findings go to Pia as subtasks, so the folder returns to her first.
If she sees it is not right, Pia stomps once (😤), carries the folder to the worker's tray (↩️) and the worker
facepalms (🤦). The Boss does not send work to a worker either: he carries it back to Pia's backlog.

**Pia moves a task from one worker to another.** Pia fetches it from the first worker's tray (🔀) and drops it
with the second. The first one shrugs (🤷).

**A task gets blocked.** Whoever has it carries it to the shelf by the windows (😩) and scratches their head.
The siren blazes for a few seconds and keeps turning for as long as anything is on the shelf.

**A task gets unblocked.** Pia rescues it from the shelf (🦸), takes it where it goes now and cheers.

**A bug is filed.** The folder goes into the bug jar (🐛). One bug escapes, runs a lap round the floor and
goes back in. Inside the jar, one bug crawls for every folder in Bugs. The whiteboard's "minutes without a
new bug" counter goes back to zero.

**Ready for live.** The folder goes onto the launch pad (🚀), the rocket takes off through the roof in a
cloud of smoke and comes back down for the next one.

**Done.** The folder is filed on the archive cabinet (🥳). Confetti, and most of the people who are awake
cheer along (🎉).

**Reopened.** Pia digs a folder back out of the archive, the pad or the jar (😮‍💨) and takes it where it goes.

**Deleted.** The folder's holder feeds it to the shredder, and paper strips fly out of the back.

**A new update on a task.** A 💬 bubble over whoever holds the folder. Ticking a task off gives ✔️.

## In between errands

| Who | With nothing in their trays | With folders waiting |
|---|---|---|
| A worker | Idle (below) | Eyeing the TODO tray (👀, 😬), the monitor blinking NEW TASK |
| Pia | Idle | Sorting the backlog (📂); with something in VERIFY PM, checking it with a magnifier (🔎) |
| A reviewer | Idle | Reviewing (see above) |
| The Boss | On the phone, putting on the green, or making the rounds (below) | Reading |

Idle people switch every 15 to 30 seconds between three ways of wasting time at the desk, each with
favourites (Wick mostly games, Pia mostly scrolls):

| Idle style | What it looks like |
|---|---|
| Dozing | Head on the desk, z's rising, a screensaver drifting on the monitor |
| Phone | Leaned back, phone up, thumb flicking, swivelling slowly left and right in the chair (📱, 😂, lol) |
| Gaming | Hunched over the keyboard, mouse hand twitching; the monitor shows a little shooter with enemies, a crosshair and muzzle flashes ("pew pew", "HEADSHOT!", "lag!!") |

Every so often two idle people (never the Boss) walk to the ping-pong table between the windows and Pia's
desk ("ping-pong?" / "you're on!"), pick up their red paddles and play a rally: the ball arcs paddle,
table, paddle; now and then someone misses ("argh!") and the score pops up. A ball that gets past a player
flies on, bounces off the floor, the desks and the fixtures a different way every time, and rolls until it
lies still. The player who missed runs after it in one go, but once close stops and watches where it goes.
When it rolls slowly along the floor they bend over and creep up on it at a third of the pace; a ball that
still rolls can get away from the slow hands, and then they run again. Once it is in reach they pick it up
("sorry!"), walk straight back to the table and the next bout is served. A match lasts 15 to 30 seconds
and ends with 🏆 for the winner. It breaks off early ("gotta go!") as soon as either player gets an errand.
Two idle people are enough: errands elsewhere in the office do not keep them from the table.

Now and then someone with nothing on their desk gets up for a drink: coffee from the machine (☕) or water
from the cooler (💧). They pour, carry the mug or paper cup back held steady in front of them, upright so
nothing spills, and drink it at their desk. About half the time a colleague tags along and waits by the
machine; the two face each other and trade two or three lines ("tabs or spaces?" / "tabs. obviously."),
then the second one pours their own. If an errand turns up for either of them the chat breaks off with
"gotta go!". Nobody goes for a drink while errands are waiting.

Cato, the Boss, never dozes. With nothing in his inbox he is on the phone, and every ten seconds or so he
gets up to play golf or to make the rounds ("making the rounds 🚶"). Golf is putting practice on the green
by his window: he takes his putter, sets the ball on the tee and putts. He stands beside the line, side-on
to the hole and looking at the ball, bent over it with both hands on the club, which swings like a pendulum
along the line to the hole. Half the putts drop ("hole in one!",
"still got it"), the rest stop short ("so close", "the green is crooked"). He walks over, fishes the ball
out of the hole or picks it up, walks back to the tee and putts again, up to a dozen times, until something
lands in his own queue. On a round he stops at two or three desks and reacts to what he finds. Someone
working gets "how's it going?" and answers "on it!". Someone dozing gets "AHEM!", jumps awake and says "I
was thinking!". A gamer gets "📸 …really?" ("it's research!"), a phone scroller gets 👀 ("🙈 checking the
board, honest"). Only his own errands hold him back, so he keeps doing this on a busy board too.

Nobody snaps from one pose into the next. Sitting down, standing up, going from idle to work and switching
habits all ease in over about half a second.

Only a dozing person gets a knock. Someone caught on the phone or mid-game gets an "ahem." and answers
"🙈 was just checking…" or "one sec, boss fight!".


## Busy boards

Each person does one errand at a time, in order, and one folder is never in two errands at once: an errand
for a folder waits until that folder's previous errand is done. When errands pile up, the office plays faster
(up to four times) until it has caught up, and the corner says how many are left. The speed buttons multiply
on top of that. Only errands from the board count towards "how many are left"; coffee, ping-pong, golf and
rounds never do. Speech bubbles stay up about two real seconds whatever the speed, so they stay readable at
4×.

`tests/office-scene.test.ts` plays the demo through the real scene, frame by frame, without a browser. It
fails when someone moves twice (or not at all) in a frame, a bubble or puff outlives its time or never
enters the scene, a parcel is never handed over, a folder does not end where the board says, an escaped
bug never returns, nobody plays ping-pong or golf, nobody fetches a coffee or a cup of water or stops for a
chat, or a hammer or wrench hangs down from the fist instead of rising out of it.

## Known limits

- A new person on the board (someone assigned for the first time, a fork added) rebuilds the floor, and
  that change shows without a walk. A crew's shadow board has all its members from the start, so this
  mostly affects boards without a crew.
- Row A holds six workers and row B four seats, the reviewers first. Anyone past that gets no desk, and
  their folders lie on Pia's desk.
- Subtasks are not drawn; they live inside their parent's folder.

## What a shadow board must provide

The room runs a few errands behind the board, because the crew has to walk. That is by design. The demo
has Play/Pause and Next step to watch a single change land.

Everything the room shows is computed from one `OfficeSnapshot` (`shared/office/model.ts`): the board's
name, the crew's name, the people (`cast`) and the tasks (id, title, column, stage, assignee, completed,
comments). It reads nothing else, so the demo board and a real board look the same to it. The demo
(`DemoBoard`) is simply a board that makes up its snapshots.

A button or menu entry links to a board's office with `officePath(boardId)` from `shared/office/model.ts`
(`/office/<boardId>`), so the path is defined in one place. The page opens in Live mode for a board id and
refuses a board its visitor cannot see ("This board is not one you can see."). A board without a crew
answers 404 as well, and the page says "No crew works on this board". A crew board that lacks a Pia or a
Boss gets a stand-in for the missing one.

A live board feeds the page through `GET /api/projects/:id/office`. The only parts of that route that know
what a shadow board is:

- `server/utils/officeCast.ts`: who sits in the room. It reads `crewBoards.shadowProjectId` and
  `crewBoardMembers` (`linkId`, `personKey`) to seat the members forked for the board, then the crew's own
  accounts. If shadow boards are rewritten, this file is the one to adapt.
- `stageOf()` in `model.ts`: maps a column's name to a stage (`Verify PM` is `verify-pm`, and so on). A board
  whose columns are named differently needs the names added there, or its cards read as "other".

Anything that yields a project with columns, top-level tasks with a column and an assignee, and a way to
tell which account is which crew member can feed the room. The page needs no change for it.
