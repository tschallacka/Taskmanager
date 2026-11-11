#!/usr/bin/env node
// Brings the crew kit up to date: `crew update [--check] [--from <kit folder | kit.tar.gz>] [--kit <kit folder>]`.
//
// Without --from the kit is the one the board serves (/crew/kit.tar.gz). A kit folder that already matches
// it changes nothing. Otherwise the kit files that differ are backed up into CREW_HOME/backups/update-<time>/kit,
// the files the new kit no longer ships are removed, and the new kit finishes the job: the owner's files
// (PROJECT-RULES.md, BRIEF.md) are merged from the template they came from (kept in CREW_HOME/kit-base),
// the skill copies are refreshed only where they still match the old kit, init renders the documents, and the
// server-side changes in CHANGELOG.md are listed, never made. CREW_HOME's own files (creds.json, crew.json,
// forks, profiles, logs) are never touched. A copy that fails puts the kit folder back from the backup.
//
// Three steps, each run by the newest code available: the command you run fetches and compares; the archive's
// own update.mjs (--apply) copies the files; the updated kit's update.mjs (--finish) merges, refreshes and renders.
// Exit codes: 0 up to date or installed; 1 an update is waiting (--check), or something needs a hand (a CONFLICT,
// a FAIL from init, or an install that was put back); 3 the kit could not be fetched or is refused.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { kitDir } from './home.mjs'

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
// What a kit never ships: tests, dotfiles, logins, runs, the kit's own records, and the archive itself.
const NOT_KIT = /\.test\.mjs$|^test-fixtures\.mjs$|^\.|^(creds|crew|crew\.config|package-lock|crew-kit|kit-instance)\.json$|\.log$|^kit\.tar\.gz$/
const SHAPE = /\.(mjs|md|tmpl|json|sh)$/
// The list of kit files travels with a folder kit (not with the board's archive), so it is installed when present.
const LIST = 'kit-files.txt'
const MANIFEST = 'crew-kit.json'
// The record a kit folder keeps of the instance it belongs to. A kit serves one instance: updating it from another
// one would put the wrong kit on a crew, so `crew update` refuses that.
const INSTANCE = 'kit-instance.json'
const ARGS = process.argv.slice(2)

const shipsName = name => name === LIST || (NAME.test(name) && SHAPE.test(name) && !NOT_KIT.test(name))
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const readText = path => (existsSync(path) ? readFileSync(path, 'utf8') : null)
const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-')
const valueOf = (name) => {
  const at = ARGS.indexOf(name)
  return at >= 0 ? ARGS[at + 1] : undefined
}
function plainFile(path) {
  if (!lstatSync(path).isFile()) throw new Error(`${path} is not a regular file (symlinks and folders are refused)`)
  return path
}
function listedNames(dir) {
  const file = join(dir, LIST)
  if (!existsSync(file)) return null
  return readFileSync(file, 'utf8').split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'))
}
// The one check for every source (folder, .tar.gz file, the board's archive): each name a kit ships, once,
// and a regular file in the staging folder. A name outside the folder is refused before anything is read.
function checkStaged(stage, names) {
  const seen = new Set()
  for (const name of names) {
    if (!shipsName(name)) throw new Error(`"${name}" is not a file a kit ships`)
    if (seen.has(name)) throw new Error(`"${name}" is listed twice`)
    seen.add(name)
    plainFile(join(stage, name))
  }
}

// The kit the update installs, copied or extracted into `stage`.
async function fetchKit(from, board, stage) {
  if (from && lstatSync(from).isDirectory()) {
    const names = listedNames(from) ?? readdirSync(from).filter(name => SHAPE.test(name) && !NOT_KIT.test(name))
    if (existsSync(join(from, LIST)) && !names.includes(LIST)) names.push(LIST)
    for (const name of names) {
      if (!shipsName(name)) throw new Error(`${join(from, LIST)} lists "${name}", which a kit does not ship`)
      if (!existsSync(join(from, name))) throw new Error(`${join(from, LIST)} lists "${name}", but ${from} has no file of that name`)
    }
    for (const name of names) copyFileSync(plainFile(join(from, name)), join(stage, name))
    checkStaged(stage, names)
    // The bootstrap writes the version the board served next to the kit; a folder without it is named "folder".
    const version = readText(join(from, 'KIT-VERSION'))?.trim() || 'folder'
    return { label: from, version, names }
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
  checkStaged(stage, names)
  return { label, version, names }
}

async function front() {
  const { config, here } = await import('./config.mjs')
  const check = ARGS.includes('--check')
  const from = valueOf('--from') ? resolve(valueOf('--from')) : undefined
  const target = resolve(valueOf('--kit') ?? kitDir)
  const host = new URL(config.board.url).host
  const instance = readJson(join(target, INSTANCE))
  if (instance?.host && instance.host !== host) {
    console.error(`crew update: this kit belongs to ${instance.host}, and this crew talks to ${host}. Use the kit folder for ${host} (for example ~/crew-kit-${host}), or make a new one.`)
    return 3
  }
  const stage = mkdtempSync(join(here, '.update-'))
  let moved = false
  try {
    let kit
    try {
      kit = await fetchKit(from, config.board.url, stage)
    } catch (error) {
      console.error(`crew update: ${error.message}`)
      return 3
    }
    const manifest = readJson(join(here, MANIFEST))
    // The files this crew has installed: the manifest of the last install, or for a crew never updated, the list it came with.
    const owned = new Set(manifest?.files ? Object.keys(manifest.files) : (listedNames(target) ?? []))
    const removed = [...owned].filter(name => name !== LIST && shipsName(name) && !kit.names.includes(name) && existsSync(join(target, name))).sort()
    const changed = kit.names.filter(name => !existsSync(join(target, name)) || sha(join(target, name)) !== sha(join(stage, name))).sort()
    if (!changed.length && !removed.length) {
      // The kit folder already holds this kit. A crew home whose record names the same files is current; one
      // recorded from an older kit (another crew home updated the folder first) still has to finish its own install.
      const recorded = manifest?.files
      const current = !recorded || kit.names.every(name => recorded[name] === sha(join(target, name)))
      if (current) {
        // A crew home with no record of this kit (one installed before the record existed) is linked to it now, so
        // `crew update --all` and the next update know which folder it uses.
        if ((manifest?.kit ? resolve(manifest.kit) : null) !== target) linkHome(here, target, kit)
        recordInstance(target, host, kit.version)
        console.log(`The crew kit in ${target} is up to date: version ${kit.version} from ${kit.label}. Nothing changed.`)
        return 0
      }
      if (check) {
        console.log(`An update is available for ${here}: its record is behind the kit folder ${target} (${kit.label}, version ${kit.version}). Run crew update to finish it.`)
        return 1
      }
      const finishDir = join(here, 'backups', `update-${stamp()}`)
      mkdirSync(join(finishDir, 'kit'), { recursive: true, mode: 0o700 })
      mkdirSync(join(finishDir, 'local'), { recursive: true, mode: 0o700 })
      renameSync(stage, join(finishDir, 'staged'))
      moved = true
      const finishPlan = join(finishDir, 'plan.json')
      writeFileSync(finishPlan, `${JSON.stringify({ kitDir: target, backupDir: finishDir, names: kit.names, changed: [], removed: [], localEdits: [], version: kit.version, label: kit.label, previous: manifest?.version ?? null, host }, null, 2)}\n`, { mode: 0o600 })
      console.log(`Finishing the install of ${kit.label} (version ${kit.version}) for ${here}: the kit folder ${target} already holds it. Backup: ${finishDir}`)
      const finish = spawnSync(process.execPath, [join(target, 'update.mjs'), '--finish', finishPlan], { stdio: 'inherit', env: process.env })
      return finish.status ?? 1
    }
    const summary = `${changed.length} file(s) to replace, ${removed.length} to remove`
    if (check) {
      console.log(`An update is available for ${target}: ${summary} (${kit.label}, version ${kit.version}). Run crew update to install it.`)
      return 1
    }
    if (!kit.names.includes('update.mjs')) {
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
    moved = true
    const planFile = join(backupDir, 'plan.json')
    writeFileSync(planFile, `${JSON.stringify({ kitDir: target, backupDir, names: kit.names, changed, removed, localEdits, version: kit.version, label: kit.label, previous: manifest?.version ?? null, host }, null, 2)}\n`, { mode: 0o600 })
    console.log(`Installing ${kit.label} (version ${kit.version}) into ${target}: ${summary}. Backup: ${backupDir}`)
    const run = spawnSync(process.execPath, [join(backupDir, 'staged', 'update.mjs'), '--apply', planFile], { stdio: 'inherit', env: process.env })
    return run.status ?? 1
  } finally {
    if (!moved) rmSync(stage, { recursive: true, force: true })
  }
}

// Puts back the files a failed install had touched, from the backup taken before it. A file that was new has
// no backup and is removed again. Returns how many were put back.
function rollback(plan, names) {
  let count = 0
  for (const name of names) {
    const dest = join(plan.kitDir, name)
    const old = join(plan.backupDir, 'kit', name)
    try {
      if (existsSync(old)) {
        if (existsSync(dest)) chmodSync(dest, 0o644)
        copyFileSync(old, dest)
        count++
      } else if (existsSync(dest)) {
        unlinkSync(dest)
        count++
      }
    } catch (error) {
      console.error(`crew update: could not put back ${dest}: ${error.message}. The backup is ${old}`)
    }
  }
  return count
}

// Runs from the archive's copy of this file: copies the planned files into the kit folder, then hands over
// to the installed copy, which finishes the update with its own config and templates. A failed copy is undone.
function apply(planFile) {
  const plan = JSON.parse(readFileSync(planFile, 'utf8'))
  const staged = join(dirname(planFile), 'staged')
  const touched = []
  // A kit folder that does not exist yet (the bootstrap's first install) is made here.
  mkdirSync(plan.kitDir, { recursive: true, mode: 0o755 })
  try {
    for (const name of plan.changed) {
      const source = plainFile(join(staged, name))
      const dest = join(plan.kitDir, name)
      touched.push(name)
      copyFileSync(source, dest)
      chmodSync(dest, 0o644)
    }
    for (const name of plan.removed) {
      touched.push(name)
      unlinkSync(join(plan.kitDir, name))
    }
  } catch (error) {
    const count = rollback(plan, touched)
    console.error(`crew update: installing the kit failed (${error.message}). ${count} file(s) of the kit folder were put back from ${join(plan.backupDir, 'kit')}, so the kit is as it was. The update is not done: fix the cause and run crew update again.`)
    return 1
  }
  const run = spawnSync(process.execPath, [join(plan.kitDir, 'update.mjs'), '--finish', planFile], { stdio: 'inherit', env: process.env })
  return run.status ?? 1
}

// Runs from the installed kit: merges the owner's files, refreshes the skill copies, renders the documents,
// records the install in CREW_HOME/crew-kit.json and reports what it could not do itself.
async function finish(planFile) {
  const plan = JSON.parse(readFileSync(planFile, 'utf8'))
  const { OWNER_FILES, config, here, renderTemplate, templateValues } = await import('./config.mjs')
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
      // No record of the template this file came from. The new template becomes the base now, so the next
      // update merges from here; the template changes made before now are not pulled in.
      const newFile = join(plan.backupDir, `${out}.new`)
      writeFileSync(newFile, theirs)
      saveBase(out, theirs)
      lines.push(`WARN ${out}: no template was recorded for this file, so the new template cannot be merged into it now. Kept as it is. The new template is in ${newFile} and is now recorded as the base, so a later update merges any template change from there on. Template changes made before this one are not brought in: compare with that file by hand.`)
    } else if (base === theirs) {
      lines.push(`${out}: the template did not change; kept`)
    } else if (ours === base) {
      copyFileSync(join(here, out), join(plan.backupDir, out))
      writeFileSync(join(here, out), theirs)
      saveBase(out, theirs)
      lines.push(`${out}: updated from the new template (no edits of yours were in it)`)
    } else {
      const oursPath = join(mergeDir, `${out}.ours`)
      const basePath = join(mergeDir, `${out}.base`)
      const theirsPath = join(mergeDir, `${out}.theirs`)
      writeFileSync(oursPath, ours)
      writeFileSync(basePath, base)
      writeFileSync(theirsPath, theirs)
      const merge = spawnSync('git', ['merge-file', '-p', oursPath, basePath, theirsPath], { encoding: 'utf8' })
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
  writeFileSync(join(here, MANIFEST), `${JSON.stringify({ version: plan.version, source: plan.label, kit: kitDir, installedAt: new Date().toISOString(), files }, null, 2)}\n`, { mode: 0o600 })
  recordInstance(kitDir, new URL(config.board.url).host, plan.version)
  console.log(`\ncrew update: the kit in ${kitDir} is version ${plan.previous ?? 'not recorded'} -> ${plan.version} (from ${plan.label}).`)
  console.log(`  ${plan.changed.length} file(s) replaced, ${plan.removed.length} removed. Backup: ${plan.backupDir}`)
  if (plan.localEdits.length) console.log(`  local edits to kit files were saved in ${join(plan.backupDir, 'local')}: ${plan.localEdits.join(', ')}`)
  for (const line of lines) console.log(`  ${line}`)
  // The people hint: if the cast shows missing people, the exact command is offered, and nothing is run by itself.
  const people = await import('./people.mjs')
  const { config } = await import('./config.mjs')
  const missing = await people.missingPeople({
    origin: new URL(config.board.url).origin,
    slug: config.crew?.slug,
    token: process.env.TASKMANAGER_MANAGEMENT_TOKEN
  })
  for (const line of people.missingLines(missing)) console.log(`  ${line}`)
  console.log(problems ? '\nNot finished: fix the CONFLICT and FAIL lines above.' : '\nDone. Restart Boss\'s Claude Code session if the agent definitions changed: Claude Code reads them when a session starts.')
  return problems ? 1 : 0
}

// Writes the record that this kit folder belongs to an instance (its host and the version it holds).
function recordInstance(folder, host, version) {
  writeFileSync(join(folder, INSTANCE), `${JSON.stringify({ host, version, recordedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 })
}

// The crew homes that use this kit folder: CREW_HOMES (colon-separated) or every folder under ~/crew-home.
function candidateHomes() {
  if (process.env.CREW_HOMES) return process.env.CREW_HOMES.split(':').filter(Boolean)
  const root = join(homedir(), 'crew-home')
  if (!existsSync(root)) return []
  return readdirSync(root).map(name => join(root, name)).filter(path => lstatSync(path).isDirectory())
}

// Links a crew home to the kit folder it was installed from: the record names the folder and the sha of each kit file
// the folder holds, as an install writes it.
function linkHome(home, folder, kit) {
  const files = Object.fromEntries(kit.names.map(name => [name, sha(join(folder, name))]))
  writeFileSync(join(home, MANIFEST), `${JSON.stringify({ version: kit.version, source: kit.label, kit: folder, installedAt: new Date().toISOString(), files }, null, 2)}\n`, { mode: 0o600 })
}

// `crew update --all`: runs the kit's own update once for every crew home of this kit folder. A home that names another
// kit folder is skipped. A home with no record of its kit (installed before the record existed) is taken as this one:
// its update links it, and the instance check still refuses a kit of another instance, with the same one sentence.
function updateAll() {
  const target = resolve(valueOf('--kit') ?? kitDir)
  // Every argument but --all goes to each home's update, so --from and --kit reach it as given.
  const forwarded = ARGS.filter(arg => arg !== '--all')
  let worst = 0
  for (const home of candidateHomes()) {
    if (!existsSync(join(home, 'crew.json'))) {
      console.log(`${home}: not a crew home (no crew.json): skipped`)
      continue
    }
    const manifest = readJson(join(home, MANIFEST))
    if (manifest?.kit && resolve(manifest.kit) !== target) {
      console.log(`${home}: uses the kit in ${manifest.kit}, not this one: skipped`)
      continue
    }
    const run = spawnSync(process.execPath, [join(target, 'update.mjs'), ...forwarded], {
      env: { ...process.env, CREW_HOME: home },
      encoding: 'utf8'
    })
    const status = run.status ?? 1
    worst = Math.max(worst, status)
    console.log(`${home}: exit ${status}`)
    const out = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim().split('\n').slice(-2).join('\n')
    if (out) console.log(out)
  }
  return worst
}

async function main() {
  if (ARGS[0] === '--apply') return apply(ARGS[1])
  if (ARGS[0] === '--finish') return finish(ARGS[1])
  if (ARGS.includes('--all')) return updateAll()
  return front()
}

main().then((code) => {
  process.exitCode = code
}, (error) => {
  console.error(`crew update: ${error.message}`)
  process.exitCode = 1
})
