#!/usr/bin/env node
// The one entry point for an agent of the crew:
//
//   crew <who> <command ...>   the board tools (tm.mjs): crew wren mcp my_tasks '{}', crew boss tools
//   crew <who> update <taskId> <body.md|-> [--internal|--customer]   post an update from a file (no JSON to escape)
//   crew <who> attach <taskId> <image>                              upload an image to a task
//   crew listen <who> [sec]    wait for new messages (listen.mjs)
//   crew watch                 the Boss's board watcher (watch.mjs)
//   crew boss-mentions         Boss's @cato watch, one line per new mention by Pia, Susy or Rita (a Monitor: mentions.mjs --follow --boss)
//   crew watch-crew            Boss's watch on Pia and Susy: prints only on trouble (watch-crew.mjs, a Monitor)
//   crew activity [hours]      what each agent Pia started is doing, from the transcripts (activity.mjs)
//   crew init                  check the machine and render the documents (init.mjs)
//   crew janet clean plan|run <who> <card> [--dry-run]   Janet's cleanup of a worker's leftovers (janet.mjs)
//   crew janet stale plan|run <card> [--dry-run]         the crew's stale worktrees: plan, then run what is granted (janet.mjs)
//   crew publish <slug> <branch> <title> <msg-file> <pr-file>   the merger's one command: squash onto a fresh base, check, push, open the PR (publish.mjs)
//   crew up                    brings the crew's parts back in order after a restart, one line each, from crew.json "up" (up.mjs)
//   crew restart-brief         after crew up: each standing member's open cards and last update, for Pia to start them fresh (restart-brief.mjs)
//   crew dev-copies            after crew up: restarts the dev copies a Verify UX or Verify QA card needs, one line each (dev-copies.mjs)
//   crew susy-daemon once|loop|start|stop|status [--live]   Susy as a daemon with no model in the loop; start/stop run the loop in its own tmux session; without --live it only logs what it would post, with --live it posts Susy's lines on the board and mails Boss when the board gives no answer (susy-daemon.mjs)
//   crew totp <file>           the current authenticator code for a dev copy's two-factor secret (totp.mjs)
//   crew claude [args...]      Claude Code with the long-run profile for this one session; `crew claude version` checks it (claude.mjs)
//   crew setup                 make one new crew for a board in one go, with the board's management token (setup.mjs)
//   crew people add [--people a,b]   add the crew's missing people; the token comes from TASKMANAGER_MANAGEMENT_TOKEN (people.mjs)
//   crew channel <who>         the Claude Code channel server for one person (channel.mjs)
//   crew <who> prepare worktree <task-id>   the worktree, branch and port for a card; --remove frees them (prepare-worktree-cli.mjs)
//   crew <who> serve [--replace|--stop|--check]   the dev copy of your worktree on your port, checked and recorded (serve.mjs)
//   crew <who> browser goto|shot|eval|console|tabs|close-tab|done   the shared browser, one context per person (browser.mjs)
//   crew browser status|shutdown                                    the shared browser for everyone
//
// The other file names (tm.mjs, listen.mjs, ...) keep working.
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crewHome } from './home.mjs'
import { writePidFile } from './pidfile.mjs'

const kit = dirname(fileURLToPath(import.meta.url))
const [first, ...rest] = process.argv.slice(2)
// Boss's two watches record their pid for the Stop hook (boss-stop-hook.sh reads CREW_HOME/.listen/<name>.pid).
if (first === 'boss-mentions' || first === 'watch-crew') writePidFile(crewHome(), first)
const scripts = { 'people': 'people.mjs', 'listen': 'listen.mjs', 'watch': 'watch.mjs', 'init': 'init.mjs', 'setup': 'setup.mjs', 'channel': 'channel.mjs', 'update': 'update.mjs', 'mentions': 'mentions.mjs', 'totp': 'totp.mjs', 'claude': 'claude.mjs', 'janet': 'janet.mjs', 'publish': 'publish.mjs', 'activity': 'activity.mjs', 'watch-crew': 'watch-crew.mjs', 'up': 'up.mjs', 'restart-brief': 'restart-brief.mjs', 'dev-copies': 'dev-copies.mjs', 'down': 'down.mjs', 'susy-daemon': 'susy-daemon.mjs' }

if (!first || first === '-h' || first === '--help') {
  console.log('usage: crew <who> <command ...> | crew <who> browser <command> | crew browser status|shutdown | crew listen <who> [sec] | crew watch | crew init | crew setup | crew channel <who> | crew mentions [minutes|--follow] | crew publish <slug> <branch> <title> <msg-file> <pr-file> | crew update [--check] [--from <kit folder|kit.tar.gz>] [--kit <folder>] | crew up | crew restart-brief')
  process.exit(first ? 0 : 2)
}

// Starting a card: `crew <who> prepare worktree <task-id>` sets up the worktree, branch, dependencies and database, and
// `crew <who> prepare worktree --remove <task-id>` removes it when it is clean and pushed (prepare-worktree-cli.mjs).
if (rest[0] === 'prepare' && rest[1] === 'worktree') {
  const run = spawnSync(process.execPath, [join(kit, 'prepare-worktree-cli.mjs'), first, ...rest.slice(2)], { stdio: 'inherit' })
  process.exit(run.status ?? 1)
}

// The dev copy of the worktree you are in, on your port: `crew <who> serve [--replace | --stop | --check]` (serve.mjs).
if (rest[0] === 'serve') {
  const run = spawnSync(process.execPath, [join(kit, 'serve.mjs'), first, ...rest.slice(1)], { stdio: 'inherit' })
  process.exit(run.status ?? 1)
}

// The shared browser: `crew <who> browser ...` and `crew browser status|shutdown`.
if (first === 'browser' || rest[0] === 'browser') {
  const browserArgs = first === 'browser' ? rest : [first, ...rest.slice(1)]
  const run = spawnSync(process.execPath, [join(kit, 'browser.mjs'), ...browserArgs], { stdio: 'inherit' })
  process.exit(run.status ?? 1)
}

// Susy's round and her agent ids: `crew susy check`, `crew susy agent <key> <id|->`. Any other `crew susy ...` is the
// person Susy's own board commands, as for every other person.
if (first === 'susy' && (rest[0] === 'check' || rest[0] === 'agent')) {
  const run = spawnSync(process.execPath, [join(kit, 'susy.mjs'), ...rest], { stdio: 'inherit' })
  process.exit(run.status ?? 1)
}

// Boss's @cato watch, a Monitor: the mentions of Pia, Susy and Rita, each printed once, every 60 s (mentions.mjs --boss).
if (first === 'boss-mentions') {
  const run = spawnSync(process.execPath, [join(kit, 'mentions.mjs'), '--follow', '--boss'], { stdio: 'inherit' })
  process.exit(run.status ?? 1)
}

const script = scripts[first] ?? 'tm.mjs'
const args = scripts[first] ? rest : process.argv.slice(2)
const run = spawnSync(process.execPath, [join(kit, script), ...args], { stdio: 'inherit' })
process.exit(run.status ?? 1)
