#!/usr/bin/env node
// Step 1 of the setup. Checks what the crew needs, writes the documents the agents read
// (CREW.md, PIETJE.md, NITPICKER.md, PIA-UX.md, PROMPTS.md, BRIEF.md, PROJECT-RULES.md) from their
// *.tmpl files with the values of crew.json, writes fonts.conf when a font directory is given,
// and writes one Claude Code agent definition per member into ~/.claude/agents. Safe to run
// again: it overwrites generated documents (edit the .tmpl, not the output) but never
// PROJECT-RULES.md or BRIEF.md once they exist.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, chmodSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CAST, agentNames, config, here, kitDir, loadForks, templateValues } from './config.mjs'

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
const render = text => text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (all, key) => (key in values ? values[key] : all))

// The templates ship in the kit folder; the documents are written to CREW_HOME.
for (const file of readdirSync(kitDir).filter(f => f.endsWith('.tmpl'))) {
  const out = file.replace(/\.tmpl$/, '')
  if (out === 'fonts.conf') {
    if (!config.fontDir) continue
  }
  // Documents the owner edits by hand are written once.
  if ((out === 'PROJECT-RULES.md' || out === 'BRIEF.md') && existsSync(`${here}${out}`)) {
    ok(`${out} exists, kept`)
    continue
  }
  const text = render(readFileSync(`${kitDir}/${file}`, 'utf8'))
  const left = text.match(/\{\{[^}]+\}\}/g)
  writeFileSync(`${here}${out}`, text)
  ok(`${out}${left ? `  (unfilled: ${[...new Set(left)].join(' ')})` : ''}`)
}

// One Claude Code agent type per member, so Boss launches and addresses each one by name. A file
// without this crew's marker is someone else's and is never overwritten.
console.log('\nAgent types')
const agentsDir = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'agents')
mkdirSync(agentsDir, { recursive: true })
const DUTIES = {
  pm: 'project manager. Plans the board, steers the workers, pre-checks Verify.',
  w1: 'worker. Builds the tasks assigned to it on the board.',
  pietje: 'usability tester. Tries the product as a first-time user and files [UX] findings for the PM.',
  nitpicker: 'code quality reviewer. Reviews the diff of each task in Verify before Boss does.',
  watcher: 'log watcher (optional). Reads the dev logs and reports what matters; changes nothing.'
}
for (const key of CAST) {
  const name = agentNames[key]
  const file = join(agentsDir, `${name}.md`)
  const marker = `<!-- ${name}: written by the crew kit's init.mjs, which rewrites this file -->`
  if (existsSync(file) && !readFileSync(file, 'utf8').includes(marker)) {
    fail(`${file} exists and was not written by init for this crew: rename or remove it, then run init again`)
    continue
  }
  const person = config.people[key]
  const keyNote = key === 'watcher' ? '' : ` (key ${key})`
  const description = `${person}${keyNote}, ${DUTIES[key] ?? DUTIES.w1} Crew "${config.team}", Taskmanager board "${config.board.name}". Launch prompt in ${here}PROMPTS.md.`
  writeFileSync(file, `---
name: ${name}
description: ${JSON.stringify(description)}
model: haiku
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
    const name = member.agentType
    const agentFile = join(agentsDir, `${name}.md`)
    const marker = `<!-- ${name}: written by the crew kit's init.mjs, which rewrites this file -->`
    if (existsSync(agentFile) && !readFileSync(agentFile, 'utf8').includes(marker)) {
      fail(`${agentFile} exists and was not written by init for this fork: rename or remove it, then run init again`)
      continue
    }
    const base = config.people[member.key] ?? member.name
    const description = `${member.name}, ${DUTIES[member.key] ?? DUTIES.w1} Forked from crew "${config.team}" for the board "${boardName}". Launch prompt in ${here}PROMPTS.md.`
    writeFileSync(agentFile, `---
name: ${name}
description: ${JSON.stringify(description)}
model: haiku
---

${marker}

You are ${member.name} on the crew "${config.team}", working for the board "${boardName}" only: your key reaches that board's crew board and nothing else.
Your role is the one ${base} has in the crew documents in ${here} (CREW.md, PROMPTS.md, PROJECT-RULES.md, BRIEF.md): follow them, with one change. Wherever they run a kit command as \`${values.node_kit}/crew.mjs ${member.key} ...\`, run it as \`${values.node_kit}/crew.mjs ${name} ...\`: that signs in as you.
`)
    ok(`${name}  (${boardName})`)
  }
}

const next = existsSync(`${here}creds.json`)
  ? `The agents' launch prompts are in ${here}PROMPTS.md. Start Boss's Claude Code session after this, or send an open one a new message: Claude Code reads the agent types then.`
  : 'No creds.json yet: make the crew (see README.md), then run init again.'
console.log(failed ? '\nFix the FAIL lines above, then run init again.' : `\nInit done. ${next}`)
process.exit(failed ? 1 : 0)
