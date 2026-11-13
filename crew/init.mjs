#!/usr/bin/env node
// Step 1 of the setup. Checks what the crew needs, writes the documents the agents read
// (CREW.md, USHER.md, NINA.md, PIA-UX.md, PROMPTS.md, BRIEF.md, PROJECT-RULES.md) from their
// *.tmpl files with the values of crew.json, writes fonts.conf when a font directory is given,
// and writes one Claude Code agent definition per member into ~/.claude/agents. Safe to run
// again: it overwrites generated documents (edit the .tmpl, not the output) but never
// PROJECT-RULES.md or BRIEF.md once they exist.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, chmodSync, copyFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { withServeCommand } from './port-registry.mjs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CAST, OWNER_FILES, agentNames, config, forkMemberPlan, here, kitDir, loadForks, modelProblems, renderTemplate, templateValues } from './config.mjs'
import { writePiaHooks } from './pia-session.mjs'
import { writeBossHooks } from './boss-session.mjs'
import { withCrewDefaults } from './crew-defaults.mjs'

const ok = m => console.log(`  ok   ${m}`)
const warn = m => console.log(`  WARN ${m}`)
const fail = (m) => {
  console.log(`  FAIL ${m}`)
  failed = true
}
let failed = false

console.log('Checks')
const major = Number(process.versions.node.split('.')[0])
major >= 20 ? ok(`node ${process.versions.node}`) : fail(`node ${process.versions.node}: need 20 or newer`)

try {
  const { chromium } = await import('playwright')
  ok('playwright is installed')
  const exe = config.chromium || process.env.CHROMIUM || chromium.executablePath()
  existsSync(exe)
    ? ok(`browser at ${exe}`)
    : fail(`no browser at ${exe}: run \`npx playwright install chromium\`, or set "chromium" in crew.config.json to an existing Chromium/Chrome binary`)
} catch { fail('playwright is missing: run `npm install` in this folder') }

if (!config.product.repo) warn('product.repo is empty: workers need the repository path to edit files')
else existsSync(config.product.repo) ? ok(`repo ${config.product.repo}`) : fail(`product.repo ${config.product.repo} does not exist`)

try {
  const res = await fetch(`${config.board.url}/api/health`).catch(() => fetch(config.board.url))
  ok(`board app answers at ${config.board.url} (${res.status})`)
} catch { fail(`nothing answers at ${config.board.url}: start the board app first`) }

if (config.chat.client) existsSync(config.chat.client) ? ok('chat client found') : fail(`chat.client ${config.chat.client} does not exist`)
else warn('no chat client configured: meetings in chat are skipped (everything else works)')

// The tools the hard rules in WORKFLOW.md name. init never installs anything: it says what is
// missing and where it comes from. The skills and their MCP servers come from one repository.
const AI_SKILLS = 'https://github.com/tschallacka/ai-skills'
const CODEGRAPH = 'https://github.com/colbymchenry/codegraph'
const claudeHome = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
const skillDir = name => join(claudeHome, 'skills', name)
// unslop is not in a repository: it ships with the kit (unslop.SKILL.md) and is copied into the
// skills folder when it is not there yet. A copy of a file from the kit; nothing is downloaded.
if (!existsSync(skillDir('unslop')) && existsSync(join(kitDir, 'unslop.SKILL.md'))) {
  mkdirSync(skillDir('unslop'), { recursive: true })
  copyFileSync(join(kitDir, 'unslop.SKILL.md'), join(skillDir('unslop'), 'SKILL.md'))
  ok('unslop skill copied from the kit into the skills folder')
}
const skillBin = name => join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'tsch-ai-skills', 'bin', name)
const onPath = (command) => {
  try {
    execSync(`command -v ${command}`, { stdio: 'pipe' })
    return true
  } catch { return false }
}
const recommended = [
  { name: 'AI text editor (skill + MCP)', have: existsSync(skillDir('ai-text-editor')) && existsSync(skillBin('ai-text-editor-mcp')), from: AI_SKILLS },
  { name: 'interactive-shell (skill + MCP)', have: existsSync(skillDir('interactive-shell')) && existsSync(skillBin('interactive-shell-mcp')), from: AI_SKILLS },
  { name: 'git-worktrees skill', have: existsSync(skillDir('git-worktrees')), from: AI_SKILLS },
  { name: 'git-merge-resolving skill', have: existsSync(skillDir('git-merge-resolving')), from: AI_SKILLS },
  { name: 'CodeGraph', have: onPath('codegraph'), from: CODEGRAPH },
  { name: 'tailpipe (skill + MCP)', have: existsSync(skillDir('tailpipe')) && existsSync(skillBin('tailpipe-mcp')), from: AI_SKILLS },
  { name: 'unslop skill', have: existsSync(skillDir('unslop')), from: null }
]
const missing = recommended.filter(tool => !tool.have)
for (const tool of recommended) tool.have ? ok(tool.name) : warn(`${tool.name} is not installed`)
if (missing.some(tool => tool.from === AI_SKILLS)) {
  console.log(`\n  The AI text editor, interactive-shell, tailpipe and git skills come from ${AI_SKILLS}.`)
  console.log('  Install them with the interactive installer (pick the skills and Claude Code as the destination):')
  console.log('    npx --yes --package @tschallacka/ai-skills ai-skills-install')
  console.log('  or, on Linux and macOS without npm:')
  console.log('    curl -fsSL https://raw.githubusercontent.com/tschallacka/ai-skills/master/installer/bootstrap.sh | sh')
}
if (missing.some(tool => tool.from === CODEGRAPH)) {
  console.log(`\n  CodeGraph comes from its upstream project, ${CODEGRAPH}. Install it with:`)
  console.log('    npm i -g @colbymchenry/codegraph')
  console.log('  or, on macOS and Linux without Node:')
  console.log('    curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh')
}
if (missing.some(tool => tool.from === null)) console.log('\n  The unslop skill could not be copied: unslop.SKILL.md is missing from the kit folder. Re-download the kit.')
if (missing.length) warn('the workflow\'s hard rules name these tools; agents cannot follow them until they are installed')

let hasFonts = true
try {
  execSync('fc-list | head -1', { stdio: 'pipe' })
} catch {
  hasFonts = false
}
if (!hasFonts && !config.fontDir) warn('no system fonts found (fc-list is empty or missing): headless Chromium may exit on some pages. Set "fontDir" in crew.config.json to a directory with .ttf fonts (e.g. DejaVu) and run init again')

console.log('\nWriting')
mkdirSync(`${here}work`, { recursive: true })
mkdirSync(`${here}backups`, { recursive: true })
const values = templateValues()
const render = text => renderTemplate(text, values)

// The templates ship in the kit folder; the documents are written to CREW_HOME.
for (const file of readdirSync(kitDir).filter(f => f.endsWith('.tmpl'))) {
  const out = file.replace(/\.tmpl$/, '')
  if (out === 'fonts.conf') {
    if (!config.fontDir) continue
  }
  // Documents the owner edits by hand are written once.
  if (OWNER_FILES.includes(out) && existsSync(`${here}${out}`)) {
    ok(`${out} exists, kept`)
    continue
  }
  const text = render(readFileSync(`${kitDir}/${file}`, 'utf8'))
  const left = text.match(/\{\{[^}]+\}\}/g)
  writeFileSync(`${here}${out}`, text)
  if (OWNER_FILES.includes(out)) {
    mkdirSync(`${here}kit-base`, { recursive: true, mode: 0o700 })
    writeFileSync(`${here}kit-base/${out}`, text, { mode: 0o600 })
  }
  ok(`${out}${left ? `  (unfilled: ${[...new Set(left)].join(' ')})` : ''}`)
}

// One Claude Code agent type per member, so Pia starts and addresses each one by name. A file
// without this crew's marker is someone else's and is never overwritten.
console.log('\nAgent types')
const agentsDir = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'agents')
mkdirSync(agentsDir, { recursive: true })
for (const problem of modelProblems) fail(`crew.json: ${problem}`)
// A person on Claude is an agent definition. OpenRouter and Ollama need a Claude Code process of their own that the
// kit does not start yet (README, "Models"), so no definition is written for them: it would silently run on Claude.
const skipsProvider = (who, { provider, model }) => {
  if (provider === 'claude') return false
  warn(`${who} is set to ${provider} (${model}): the kit does not start that provider yet, so it writes no agent definition for ${who} (README, "Models")`)
  return true
}
const DUTIES = {
  pia: 'project manager. Plans the board, steers the workers, pre-checks Verify.',
  wren: 'worker. Builds the tasks assigned to it on the board.',
  usher: 'usability tester. Tries the product as a first-time user and files [UX] findings for the PM.',
  nina: 'code quality reviewer. Reviews the diff of each task in Verify before Boss does.',
  quincy: 'QA. Uses the finished task like a customer, or like an agent with no prior knowledge, and files QA violations for the PM.',
  susy: 'secretary. Pokes the people who are needed to move a card on, and nobody else.',
  janet: 'janitor. Cleans up a worker\'s leftovers once the worker is done with a card.',
  pat: 'PM-gate checker. Pre-checks each card in Verify PM against its acceptance criteria.',
  tess: 'triage. Sorts the tester\'s findings and bugs, and assigns them.',
  rita: 'reporter. Writes the status reports to Boss and the minutes of meetings.',
  watcher: 'log watcher (optional). Reads the dev logs and reports what matters; changes nothing.'
}
for (const key of CAST.filter(member => forkMemberPlan(member) === 'write')) {
  const name = agentNames[key]
  const file = join(agentsDir, `${name}.md`)
  const marker = `<!-- ${name}: written by the crew kit's init.mjs, which rewrites this file -->`
  if (existsSync(file) && !readFileSync(file, 'utf8').includes(marker)) {
    fail(`${file} exists and was not written by init for this crew: rename or remove it, then run init again`)
    continue
  }
  const person = config.people[key]
  const { model } = config.models[key]
  if (skipsProvider(name, config.models[key])) continue
  const keyNote = key === 'watcher' ? '' : ` (key ${key})`
  const description = `${person}${keyNote}, ${DUTIES[key] ?? DUTIES.wren} Crew "${config.team}", Taskmanager board "${config.board.name}". Launch prompt in ${here}PROMPTS.md.`
  writeFileSync(file, `---
name: ${name}
description: ${JSON.stringify(description)}
model: ${model}
---

${marker}

You are ${person} on the crew "${config.team}". Your launch prompt holds your role: follow it and the crew documents in ${here} (CREW.md, PROJECT-RULES.md, BRIEF.md). Run every crew-kit command the way those documents write it, starting with \`${values.node_kit}/\`: that sets CREW_HOME for this crew, and without it the kit cannot find crew.json.
`)
  ok(`${name}`)
}

// Forks: the files the board hands over under "Fork the crew for this board". `--forks a.json b.json` puts
// them in CREW_HOME/forks (private, replacing a file of the same name: new keys), and every file in that
// folder gets one agent type per member, named by the board and the person (`internal-tools-wren`). A fork
// signs in as that name: `crew internal-tools-wren mcp get_board`.
console.log('\nForks')
const forksAt = process.argv.indexOf('--forks')
const forkFiles = forksAt >= 0 ? process.argv.slice(forksAt + 1).filter(arg => !arg.startsWith('--')) : []
if (forkFiles.length) {
  mkdirSync(`${here}forks`, { recursive: true, mode: 0o700 })
  for (const source of forkFiles) {
    try {
      const data = JSON.parse(readFileSync(source, 'utf8'))
      const usable = Array.isArray(data.members) && data.members.length && data.members.every(m => m?.agentType && m.apiKey && m.email)
      if (!usable) throw new Error('it is not a forks file from the board (no members with an agent type and a key)')
      const target = `${here}forks/${source.split('/').pop()}`
      writeFileSync(target, readFileSync(source), { mode: 0o600 })
      chmodSync(target, 0o600)
      ok(`${source} stored in ${here}forks`)
    } catch (error) { fail(`${source}: ${error.message}`) }
  }
}
const forks = loadForks()
if (!forks.length) console.log('  none (hand a fork over with: init.mjs --forks <file from the board>)')
for (const { file, data } of forks) {
  const boardName = data.board?.name ?? file
  for (const member of data.members) {
    // An extra worker runs on its own model: no agent definition. A key the kit does not know is an error, not a
    // Claude agent with some other member's model.
    const plan = forkMemberPlan(member.key)
    if (plan === 'unknown') {
      fail(`${file}: "${member.key}" is not a crew member this kit knows; no agent definition is written for it`)
      continue
    }
    if (plan === 'skip') {
      ok(`${member.agentType}  (extra worker: no agent definition, it runs on its own model)`)
      continue
    }
    const name = member.agentType
    const agentFile = join(agentsDir, `${name}.md`)
    const marker = `<!-- ${name}: written by the crew kit's init.mjs, which rewrites this file -->`
    if (existsSync(agentFile) && !readFileSync(agentFile, 'utf8').includes(marker)) {
      fail(`${agentFile} exists and was not written by init for this fork: rename or remove it, then run init again`)
      continue
    }
    const base = config.people[member.key] ?? member.name
    const chosen = config.models[member.key]
    if (skipsProvider(name, chosen)) continue
    const description = `${member.name}, ${DUTIES[member.key] ?? DUTIES.wren} Forked from crew "${config.team}" for the board "${boardName}". Launch prompt in ${here}PROMPTS.md.`
    writeFileSync(agentFile, `---
name: ${name}
description: ${JSON.stringify(description)}
model: ${chosen.model}
---

${marker}

You are ${member.name} on the crew "${config.team}", working for the board "${boardName}" only: your key reaches that board's crew board and nothing else.
Your role is the one ${base} has in the crew documents in ${here} (CREW.md, PROMPTS.md, PROJECT-RULES.md, BRIEF.md): follow them, with one change. Wherever they run a kit command as \`${values.node_kit}/crew.mjs ${member.key} ...\`, run it as \`${values.node_kit}/crew.mjs ${name} ...\`: that signs in as you.
`)
    ok(`${name}  (${boardName})`)
  }
}

// Pia's own session: its Stop and SessionStart hooks keep her board listener running (pia-listener-hook.sh). Written
// only when she runs on Claude, the provider the kit can start. Other keys in her settings file are kept.
console.log('\nPia session')
if (!skipsProvider('pia', config.models.pia)) {
  try {
    const { file, changed } = writePiaHooks(`${here}pia-session`, { crewHome: here.replace(/\/$/, ''), kitDir: kitDir.replace(/\/$/, '') })
    ok(`${file} ${changed ? 'written: her listener hooks' : 'kept, hooks already current'}`)
  } catch (error) { fail(error.message) }
}

// The worktree folder: prepare worktree needs it; init does not guess it, setup writes it from --worktree-base.
if (typeof config.worktreeBase !== 'string' || !config.worktreeBase.startsWith('/')) {
  warn('crew.json has no "worktreeBase" (an absolute folder): set it, or "crew <who> prepare worktree" stops with a clear message')
}

// The dev copies: the start command (scripts.serve), written only where missing. The ports (devServers) are written by
// crew-defaults below, for the crew's people only.
const serveDefault = withServeCommand(config)
if (serveDefault.changed) {
  writeFileSync(`${here}crew.json`, `${JSON.stringify(serveDefault.config, null, 2)}\n`, { mode: 0o600 })
  ok('crew.json: the start command (scripts.serve) was written where it was missing')
}

// Boss's session: its Stop hook keeps the two crew watches running (boss-stop-hook.sh). Written into the folder that
// crew.json names as "bossSession"; without one, init says so and writes nothing, because a hook in a folder Boss does
// not run in does nothing.
console.log('\nBoss session')
if (!config.bossSession) warn('crew.json has no "bossSession": set it to the folder Boss runs its Claude Code session in, then run init again, or Boss\'s Stop hook is not written')
else {
  try {
    const { file, changed, excluded } = writeBossHooks(config.bossSession, { crewHome: here.replace(/\/$/, ''), kitDir: kitDir.replace(/\/$/, '') })
    ok(`${file} ${changed ? 'written: the watch hook' : 'kept, hook already current'}${excluded ? ' (kept out of git)' : ''}`)
  } catch (error) { fail(error.message) }
}

// crew.json's "reader" and "devServers" default from the keys of the crew's people (creds.json); a field already set stays.
try {
  const crewFile = join(here, 'crew.json')
  const credsFile = join(here, 'creds.json')
  if (existsSync(crewFile) && existsSync(credsFile)) {
    const creds = JSON.parse(readFileSync(credsFile, 'utf8'))
    const { crew: filled, added } = withCrewDefaults(JSON.parse(readFileSync(crewFile, 'utf8')), Object.keys(creds.people ?? {}))
    if (added.length) {
      writeFileSync(crewFile, `${JSON.stringify(filled, null, 2)}\n`, { mode: 0o600 })
      ok(`crew.json: ${added.join(' and ')} set from the crew's people`)
    }
  }
} catch (error) {
  fail(`crew.json defaults: ${error.message}`)
}

const next = existsSync(`${here}creds.json`)
  ? `The agents' launch prompts are in ${here}PROMPTS.md. Start Boss's Claude Code session after this, or send an open one a new message: Claude Code reads the agent types then.`
  : 'No creds.json yet: make the crew (see README.md), then run init again.'
console.log(failed ? '\nFix the FAIL lines above, then run init again.' : `\nInit done. ${next}`)
process.exit(failed ? 1 : 0)
