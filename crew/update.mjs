#!/usr/bin/env node
// Brings the crew kit up to date: `crew update [--check] [--from <kit folder | kit.tar.gz>] [--kit <kit folder>]`.
//
// Without --from the kit is the one the board serves (/crew/kit.tar.gz). A kit folder that already matches
// it changes nothing. Otherwise the kit files that differ are backed up into CREW_HOME/backups/update-<time>/kit,
// the files the new kit no longer ships are removed, and the new kit finishes the job: the owner's files
// (PROJECT-RULES.md, BRIEF.md) are merged from the template they came from (kept in CREW_HOME/kit-base),
// the skill copies are refreshed only where they still match the old kit, init renders the documents, and the
// server-side changes in CHANGELOG.md are listed, never made. CREW_HOME's own files (creds.json, crew.json,
// forks, profiles, logs) are never touched.
//
// Three steps, each run by the newest code available: the command you run fetches and compares; the archive's
// own update.mjs (--apply) copies the files; the updated kit's update.mjs (--finish) merges, refreshes and renders.
// Exit codes: 0 up to date or installed, 1 an update is available (--check) or something needs a hand (a
// CONFLICT, a WARN that asks for a look, an init FAIL), 3 the kit could not be fetched or is refused.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { kitDir } from './home.mjs'

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
// What a kit never ships and an update never touches: tests, dotfiles, the list itself, logins, runs.
const NOT_KIT = /\.test\.mjs$|^\.|^kit-files\.txt$|^(creds|crew|crew\.config|package-lock|crew-kit)\.json$|\.log$/
const SHAPE = /\.(mjs|md|tmpl|json|sh)$|^fonts\.conf/
const MANIFEST = 'crew-kit.json'
const ARGS = process.argv.slice(2)

const shipsName = name => NAME.test(name) && !NOT_KIT.test(name)
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const readText = path => (existsSync(path) ? readFileSync(path, 'utf8') : null)
const readJson = path => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-')
const valueOf = name => {
  const at = ARGS.indexOf(name)
  return at >= 0 ? ARGS[at + 1] : undefined
}
function plainFile(path) {
  if (!lstatSync(path).isFile()) throw new Error(`${path} is not a regular file (symlinks and folders are refused)`)
  return path
}
function listedNames(dir) {
  const file = join(dir, 'kit-files.txt')
  if (!existsSync(file)) return null
  return readFileSync(file, 'utf8').split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'))
}

// The kit the update installs: a folder, a .tar.gz file, or the board's archive. Its files are copied or
// extracted into `stage`, and only plain file names the kit ships are accepted.
async function fetchKit(from, board, stage) {
  if (from && lstatSync(from).isDirectory()) {
    const names = listedNames(from) ?? readdirSync(from).filter(name => SHAPE.test(name) && !NOT_KIT.test(name))
    for (const name of names) copyFileSync(plainFile(join(from, name)), join(stage, name))
    return { label: from, version: 'folder', names }
  }
  let archive
  let label
  let version
  if (from) {
    label = from
    version = 'file'
    archive = readFileSync(from)
  } else {
    label = `${board}/crew/kit.tar.gz`
    let res
    try {
      res = await fetch(label, { signal: AbortSignal.timeout(60000) })
    } catch (error) {
      throw new Error(`cannot reach ${label}: ${error.message}`)
    }
    if (!res.ok) throw new Error(`${label} answered HTTP ${res.status}`)
    archive = Buffer.from(await res.arrayBuffer())
    version = res.headers.get('x-crew-kit-version') ?? 'unknown'
  }
  const archivePath = join(stage, 'kit.tar.gz')
  writeFileSync(archivePath, archive)
  const listing = spawnSync('tar', ['-tzf', archivePath], { encoding: 'utf8' })
  if (listing.status !== 0) throw new Error(`${label} is not a readable kit archive`)
  const names = listing.stdout.split('\n').map(line => line.trim()).filter(Boolean)
  for (const name of names) if (!shipsName(name)) throw new Error(`the archive lists "${name}", which a kit does not ship`)
  const extract = spawnSync('tar', ['-xzf', archivePath, '-C', stage, ...names], { stdio: 'pipe' })
  if (extract.status !== 0) throw new Error(`extracting ${label} failed`)
  rmSync(archivePath)
  for (const name of names) plainFile(join(stage, name))
  return { label, version, names }
}

async function front() {
  const { config, here } = await import('./config.mjs')
  const check = ARGS.includes('--check')
  const from = valueOf('--from') ? resolve(valueOf('--from')) : undefined
  const target = resolve(valueOf('--kit') ?? kitDir)
  mkdirSync(join(here, 'work'), { recursive: true })
  const stage = mkdtempSync(join(here, 'work', 'update-'))
  let kit
  try {
    kit = await fetchKit(from, config.board.url, stage)
  } catch (error) {
    rmSync(stage, { recursive: true, force: true })
    console.error(`crew update: ${error.message}`)
    return 3
  }
  const manifest = readJson(join(here, MANIFEST))
  const owned = new Set([...Object.keys(manifest?.files ?? {}), ...(listedNames(target) ?? [])])
  const removed = [...owned].filter(name => shipsName(name) && !kit.names.includes(name) && existsSync(join(target, name))).sort()
  const changed = kit.names.filter(name => !existsSync(join(target, name)) || sha(join(target, name)) !== sha(join(stage, name))).sort()
  if (!changed.length && !removed.length) {
    rmSync(stage, { recursive: true, force: true })
    console.log(`The crew kit in ${target} is up to date: version ${kit.version} from ${kit.label}. Nothing changed.`)
    return 0
  }
  const summary = `${changed.length} file(s) to replace, ${removed.length} to remove`
  if (check) {
    rmSync(stage, { recursive: true, force: true })
    console.log(`An update is available for ${target}: ${summary} (${kit.label}, version ${kit.version}). Run crew update to install it.`)
    return 1
  }
  if (!kit.names.includes('update.mjs')) {
    rmSync(stage, { recursive: true, force: true })
    console.error(`crew update: ${kit.label} has no update.mjs, so it cannot update itself. Unpack it by hand (README, "Updating").`)
    return 3
  }
  const backupDir = join(here, 'backups', `update-${stamp()}`)
  mkdirSync(join(backupDir, 'kit'), { recursive: true, mode: 0o700 })
  mkdirSync(join(backupDir, 'local'), { recursive: true, mode: 0o700 })
  for (const name of [...changed, ...removed]) {
    if (existsSync(join(target, name))) copyFileSync(join(target, name), join(backupDir, 'kit', name))
  }
  // A kit file whose content is not what the last install wrote was edited by hand: keep that copy too.
  const localEdits = changed.filter(name => manifest?.files?.[name] && existsSync(join(target, name)) && sha(join(target, name)) !== manifest.files[name])
  for (const name of localEdits) copyFileSync(join(target, name), join(backupDir, 'local', name))
  renameSync(stage, join(backupDir, 'staged'))
  const planFile = join(backupDir, 'plan.json')
  writeFileSync(planFile, `${JSON.stringify({ kitDir: target, backupDir, names: kit.names, changed, removed, localEdits, version: kit.version, label: kit.label }, null, 2)}\n`, { mode: 0o600 })
  console.log(`Installing ${kit.label} (version ${kit.version}) into ${target}: ${summary}. Backup: ${backupDir}`)
  const run = spawnSync(process.execPath, [join(backupDir, 'staged', 'update.mjs'), '--apply', planFile], { stdio: 'inherit', env: process.env })
  return run.status ?? 1
}

// Runs from the archive's copy of this file: copies the planned files into the kit folder, then hands over
// to the installed copy, which finishes the update with its own config and templates.
function apply(planFile) {
  const plan = JSON.parse(readFileSync(planFile, 'utf8'))
  const staged = join(dirname(planFile), 'staged')
  for (const name of plan.changed) {
    copyFileSync(plainFile(join(staged, name)), join(plan.kitDir, name))
    chmodSync(join(plan.kitDir, name), 0o644)
  }
  for (const name of plan.removed) unlinkSync(join(plan.kitDir, name))
  const run = spawnSync(process.execPath, [join(plan.kitDir, 'update.mjs'), '--finish', planFile], { stdio: 'inherit', env: process.env })
  return run.status ?? 1
}

// Runs from the installed kit: merges the owner's files, refreshes the skill copies, renders the documents,
// records the install in CREW_HOME/crew-kit.json and reports what it could not do itself.
async function finish(planFile) {
  const plan = JSON.parse(readFileSync(planFile, 'utf8'))
  const { OWNER_FILES, here, renderTemplate, templateValues } = await import('./config.mjs')
  const values = templateValues()
  const lines = []
  let problems = 0
  const mergeDir = join(plan.backupDir, 'merge')
  mkdirSync(mergeDir, { recursive: true, mode: 0o700 })
  const saveBase = (out, text) => {
    mkdirSync(join(here, 'kit-base'), { recursive: true, mode: 0o700 })
    writeFileSync(join(here, 'kit-base', out), text, { mode: 0o600 })
  }
  for (const out of OWNER_FILES) {
    const theirs = renderTemplate(readFileSync(join(kitDir, `${out}.tmpl`), 'utf8'), values)
    const ours = readText(join(here, out))
    const base = readText(join(here, 'kit-base', out))
    if (ours === null) {
      lines.push(`${out}: not there; init writes it from the new template`)
    } else if (ours === theirs) {
      saveBase(out, theirs)
      lines.push(`${out}: already matches the new template`)
    } else if (base === null) {
      writeFileSync(join(plan.backupDir, `${out}.new`), theirs)
      lines.push(`WARN ${out}: the template it came from is not recorded, so it cannot be merged. Kept as it is. The new template is in ${join(plan.backupDir, `${out}.new`)}; compare the two by hand. The next update merges.`)
    } else if (base === theirs) {
      lines.push(`${out}: the template did not change; kept`)
    } else if (ours === base) {
      copyFileSync(join(here, out), join(plan.backupDir, out))
      writeFileSync(join(here, out), theirs)
      saveBase(out, theirs)
      lines.push(`${out}: updated from the new template (no edits of yours were in it)`)
    } else {
      const ours$ = join(mergeDir, `${out}.ours`)
      const base$ = join(mergeDir, `${out}.base`)
      const theirs$ = join(mergeDir, `${out}.theirs`)
      writeFileSync(ours$, ours)
      writeFileSync(base$, base)
      writeFileSync(theirs$, theirs)
      const merge = spawnSync('git', ['merge-file', '-p', ours$, base$, theirs$], { encoding: 'utf8' })
      if (merge.status === 0) {
        copyFileSync(join(here, out), join(plan.backupDir, out))
        writeFileSync(join(here, out), merge.stdout)
        saveBase(out, theirs)
        lines.push(`${out}: your edits and the new template merged cleanly (your file before: ${join(plan.backupDir, out)})`)
      } else {
        const conflicted = join(plan.backupDir, `${out}.merged`)
        writeFileSync(conflicted, merge.stdout ?? '')
        problems++
        const why = merge.status > 0 ? `${merge.status} conflict(s)` : 'git merge-file is not available'
        lines.push(`CONFLICT ${out}: ${why}. Kept as it is. The merged text with conflict markers is in ${conflicted}; resolve it by hand and copy it over ${join(here, out)}.`)
      }
    }
  }
  // The skill copies in the Claude skills folder are refreshed only while they still match the old kit.
  const claudeHome = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  const skills = [
    { label: 'taskmanager-crew', file: 'SKILL.md', target: join(claudeHome, 'skills', 'taskmanager-crew', 'SKILL.md') },
    { label: 'unslop', file: 'unslop.SKILL.md', target: join(claudeHome, 'skills', 'unslop', 'SKILL.md') }
  ]
  for (const skill of skills) {
    if (!existsSync(skill.target)) {
      lines.push(`skill ${skill.label}: no copy in the skills folder`)
      continue
    }
    const now = readText(join(kitDir, skill.file))
    const current = readText(skill.target)
    const previous = plan.changed.includes(skill.file) ? readText(join(plan.backupDir, 'kit', skill.file)) : now
    if (current === now) {
      lines.push(`skill ${skill.label}: the copy matches the kit`)
    } else if (current === previous) {
      copyFileSync(join(kitDir, skill.file), skill.target)
      lines.push(`skill ${skill.label}: copy refreshed from the kit`)
    } else {
      lines.push(`WARN skill ${skill.label}: the copy at ${skill.target} differs from the kit and was not touched; the kit's copy is ${join(kitDir, skill.file)}`)
    }
  }
  // Server-side changes are only reported: the Taskmanager app is not changed by this command.
  const oldLog = readText(join(plan.backupDir, 'kit', 'CHANGELOG.md'))
  const newLog = readText(join(kitDir, 'CHANGELOG.md'))
  if (oldLog !== null && newLog !== null) {
    const seen = new Set(oldLog.split('\n'))
    const added = newLog.split('\n').filter(line => line.trim() && !seen.has(line))
    for (const line of added.filter(text => /\bserver\//.test(text) || /\bthe board app\b|\bTaskmanager (server|app)\b/i.test(text))) {
      lines.push(`server side, not changed here: ${line.replace(/^[-*]\s*/, '').slice(0, 200)}`)
    }
  }
  const init = spawnSync(process.execPath, [join(kitDir, 'init.mjs')], { stdio: 'inherit', env: process.env })
  if (init.status !== 0) {
    problems++
    lines.push('FAIL init reported problems (above): fix them, then run init again')
  } else {
    lines.push('init rendered the documents from the new templates')
  }
  const files = Object.fromEntries(plan.names.map(name => [name, sha(join(kitDir, name))]))
  writeFileSync(join(here, MANIFEST), `${JSON.stringify({ version: plan.version, source: plan.label, installedAt: new Date().toISOString(), files }, null, 2)}\n`, { mode: 0o600 })
  console.log(`\ncrew update: the kit in ${kitDir} is version ${plan.version} (from ${plan.label}).`)
  console.log(`  ${plan.changed.length} file(s) replaced, ${plan.removed.length} removed. Backup: ${plan.backupDir}`)
  if (plan.localEdits.length) console.log(`  local edits to kit files were saved in ${join(plan.backupDir, 'local')}: ${plan.localEdits.join(', ')}`)
  for (const line of lines) console.log(`  ${line}`)
  console.log(problems ? '\nNot finished: fix the CONFLICT and FAIL lines above.' : '\nDone. Restart Boss\'s Claude Code session if the agent definitions changed: Claude Code reads them when a session starts.')
  return problems ? 1 : 0
}

async function main() {
  if (ARGS[0] === '--apply') return apply(ARGS[1])
  if (ARGS[0] === '--finish') return finish(ARGS[1])
  return front()
}

main().then((code) => {
  process.exitCode = code
}, (error) => {
  console.error(`crew update: ${error.message}`)
  process.exitCode = 1
})
