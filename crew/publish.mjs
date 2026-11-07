#!/usr/bin/env node
// crew publish: the merger's one command. It squashes a finished branch onto a fresh base in a clean worktree,
// runs the checks on the merged tree, then commits, pushes and opens the pull request.
//
//   crew publish <slug> <branch> <title> <msg-file> <pr-file>
//
// Everything that is particular to the repository (the paths, the commands, the commit identity, the attribution
// lines, the pull request command) comes from crew.json under "publish" (README, "Publish"). A setting that is empty
// skips its step, and the skip is printed, never silent.
//
// The safety rules:
// - the base is fetched and the worktree starts from the fetched base, so the main checkout is never touched;
// - the worktree and the logs live under the crew home (<crew home>/publish), never in /tmp;
// - a conflict stops with exit 3 and leaves the worktree for a hand merge;
// - a failing check stops with exit 4 before anything is pushed, unless FORCE=1 is set;
// - a command never sees a database URL from the environment: DATABASE_URL is the scratch database or nothing;
// - nothing is merged, deployed or migrated against a real database; the kit has no step for that.
//
// Exit codes: 0 published, 1 a git or setup failure, 2 usage, 3 merge conflict, 4 a check failed (nothing pushed).
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crewHome } from './home.mjs'

// The settings and what kind each one is. "list" is an array of strings, "number" a whole number of seconds.
const KINDS = {
  repo: 'string', remote: 'string', base: 'string', dir: 'string', install: 'string', link: 'list',
  typecheck: 'string', lint: 'string', lintFiles: 'string', test: 'string', migrate: 'string', scratchDatabase: 'string',
  schemaFiles: 'list', lockFiles: 'list', commitName: 'string', commitEmail: 'string', attribution: 'list',
  pr: 'string', timeout: 'number'
}
const DEFAULTS = { remote: 'origin', base: 'main', dir: '', link: [], lint: '', lintFiles: '', schemaFiles: [], lockFiles: [], attribution: [], timeout: 600 }

/**
 * The publish settings as the kit reads them: the defaults filled in, and every problem named. An unknown key is a
 * problem too, so a misspelt setting never passes silently.
 */
export function parseSettings(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { settings: null, problems: ['publish must be an object in crew.json'] }
  const problems = []
  for (const key of Object.keys(raw)) {
    if (!(key in KINDS)) problems.push(`publish.${key} is not a setting (the settings are ${Object.keys(KINDS).join(', ')})`)
  }
  const settings = { ...DEFAULTS }
  for (const [key, kind] of Object.entries(KINDS)) {
    const value = raw[key]
    if (value === undefined || value === null) continue
    if (kind === 'string' && typeof value !== 'string') problems.push(`publish.${key} must be a string`)
    else if (kind === 'list' && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) problems.push(`publish.${key} must be a list of strings`)
    else if (kind === 'number' && (!Number.isInteger(value) || value < 1)) problems.push(`publish.${key} must be a whole number of seconds`)
    else settings[key] = value
  }
  if (!settings.repo) problems.push('publish.repo is not set: the path of the repository to publish from (or set product.repo)')
  if (!settings.base) problems.push('publish.base is empty: name the base branch, such as main')
  if (!settings.remote) problems.push('publish.remote is empty: name the remote, such as origin')
  if (Boolean(settings.commitName) !== Boolean(settings.commitEmail)) problems.push('publish.commitName and publish.commitEmail go together: set both or neither')
  if (settings.lintFiles) {
    try {
      new RegExp(settings.lintFiles)
    } catch {
      problems.push('publish.lintFiles is not a valid regular expression')
    }
  }
  return { settings: problems.length ? null : settings, problems }
}

// A value as one shell word. Titles and paths come from the command line, so nothing reaches the shell unquoted.
export function shellQuote(text) {
  return `'${String(text).replace(/'/g, `'\\''`)}'`
}

/** Fills {name} from the values, each one quoted; a list becomes quoted words in a row. A name with no value stays. */
export function expandPlaceholders(template, values) {
  return template.replace(/\{(\w+)\}/g, (all, key) => {
    if (!(key in values)) return all
    const value = values[key]
    return Array.isArray(value) ? value.map(shellQuote).join(' ') : shellQuote(value)
  })
}

/** The notes the merged change earns: a schema or a lock file changed, which the merger has to act on by hand. */
export function changeNotes(changed, settings) {
  const notes = []
  if (settings.schemaFiles.some(file => changed.includes(file))) notes.push('schema')
  if (settings.lockFiles.some(file => changed.includes(file))) notes.push('lock')
  return notes
}

const say = text => console.log(text)
const tail = (text, lines) => text.trimEnd().split('\n').slice(-lines).join('\n')

function git(cwd, args, input) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8', input, maxBuffer: 256 << 20 })
  return { ok: run.status === 0, stdout: run.stdout ?? '', output: `${run.stdout ?? ''}${run.stderr ?? ''}`.trim() }
}

// A command runs in a shell inside the worktree. DATABASE_URL from the caller's environment is removed: the command
// gets the scratch database when publish.scratchDatabase is set, and no database otherwise.
function shell(ctx, name, command) {
  const env = { ...process.env }
  delete env.DATABASE_URL
  if (ctx.settings.scratchDatabase) env.DATABASE_URL = ctx.settings.scratchDatabase
  const run = spawnSync('/bin/sh', ['-c', command], { cwd: ctx.wt, encoding: 'utf8', env, timeout: ctx.settings.timeout * 1000, maxBuffer: 256 << 20 })
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}${run.error ? `\n${run.error.message}` : ''}`
  const log = join(ctx.logs, `${name}-${ctx.slug}.log`)
  writeFileSync(log, output)
  return { ok: run.status === 0, output, log }
}

// The symbolic links that stand in for untracked folders (publish.link, such as node_modules) exist only while the
// checks run: they are removed before the commit, so they never reach it.
function removeLinks(ctx) {
  for (const target of ctx.links) {
    if (lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) unlinkSync(target)
  }
  ctx.links = []
}

function stop(ctx, code, message) {
  removeLinks(ctx)
  console.error(message)
  process.exit(code)
}

// A check that failed stops the publish before the push, unless FORCE=1 goes on past it.
function check(ctx, name, label, command, forced) {
  if (!command) {
    say(`  skipped: publish.${name} is empty, so no ${label} ran`)
    return
  }
  say(`${label}:`)
  const result = shell(ctx, name, command)
  if (result.ok) {
    say(`  ok (log ${result.log})`)
    return
  }
  say(`  FAILED (log ${result.log}):`)
  say(tail(result.output, 12))
  if (ctx.force) {
    say(`  FORCE=1: going on past the failed ${label}`)
    forced.push(label)
    return
  }
  stop(ctx, 4, `stop before pushing: the ${label} failed (FORCE=1 pushes anyway)`)
}

function usage() {
  console.error('usage: crew publish <slug> <branch> <title> <msg-file> <pr-file>')
  process.exit(2)
}

async function main(argv) {
  const [slug, branch, title, msgFile, prFile] = argv
  if (argv.length !== 5 || !slug || !branch || !title || !msgFile || !prFile) usage()
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    console.error(`"${slug}" is not a slug: lower-case letters, digits and dashes`)
    process.exit(2)
  }
  const { config } = await import('./config.mjs')
  const { settings, problems } = parseSettings(config.publish)
  if (problems.length) {
    for (const problem of problems) console.error(`crew.json: ${problem}`)
    process.exit(1)
  }
  for (const file of [msgFile, prFile]) {
    if (!existsSync(file)) {
      console.error(`${file} does not exist: the commit message and the pull request body are files`)
      process.exit(2)
    }
  }
  const dir = settings.dir ? resolve(settings.dir) : join(crewHome(), 'publish')
  const ctx = {
    slug, branch, title, msgFile, prFile, settings, dir, links: [],
    wt: join(dir, `wt-${slug}`), logs: join(dir, 'logs'), force: process.env.FORCE === '1'
  }
  const forced = []
  const repo = resolve(settings.repo)
  const baseRef = `${settings.remote}/${settings.base}`
  const crewBranch = `crew-${slug}`
  mkdirSync(ctx.logs, { recursive: true })
  if (!existsSync(join(repo, '.git'))) {
    console.error(`${repo} is not a git repository (publish.repo)`)
    process.exit(1)
  }

  say(`fetch ${settings.remote}:`)
  const fetched = git(repo, ['fetch', '-q', settings.remote])
  if (!fetched.ok) stop(ctx, 1, `fetch failed:\n${fetched.output}`)
  if (!git(repo, ['rev-parse', '--verify', '-q', `${baseRef}^{commit}`]).ok) stop(ctx, 1, `${baseRef} does not exist after the fetch`)
  if (!git(repo, ['rev-parse', '--verify', '-q', `${branch}^{commit}`]).ok) stop(ctx, 1, `${branch} is not a branch or commit of ${repo}`)
  say(`  base ${baseRef} fetched; the main checkout is not touched`)

  say(`worktree ${ctx.wt}:`)
  git(repo, ['worktree', 'remove', '--force', ctx.wt])
  git(repo, ['worktree', 'prune'])
  rmSync(ctx.wt, { recursive: true, force: true })
  git(repo, ['branch', '-D', crewBranch])
  const added = git(repo, ['worktree', 'add', '-q', '-b', crewBranch, ctx.wt, baseRef])
  if (!added.ok) stop(ctx, 1, `worktree failed:\n${added.output}`)

  say(`merge --squash ${branch}:`)
  const merged = git(ctx.wt, ['merge', '--squash', branch])
  if (!merged.ok) {
    const conflicted = git(ctx.wt, ['diff', '--name-only', '--diff-filter=U']).stdout.trim()
    if (!conflicted) stop(ctx, 1, `merge failed:\n${merged.output}`)
    stop(ctx, 3, `MERGE CONFLICT in ${ctx.wt}: resolve it there, then commit, push and open the pull request by hand.\nConflicted:\n${conflicted}`)
  }
  say(tail(git(ctx.wt, ['status', '--short']).stdout, 40) || '  (nothing)')
  const changed = git(ctx.wt, ['diff', '--cached', '--name-only']).stdout.split('\n').filter(Boolean)
  if (!changed.length) stop(ctx, 1, `nothing to publish: ${branch} adds nothing to ${baseRef}`)
  const addedFiles = git(ctx.wt, ['diff', '--cached', '--name-only', '--diff-filter=AM']).stdout.split('\n').filter(Boolean)

  for (const note of changeNotes(changed, settings)) {
    if (note === 'schema') say('NOTE: the schema changed. The merged tree is checked against it; migrate the scratch database by hand if no publish.migrate runs.')
    if (note === 'lock') say('NOTE: a lock file changed: run the install in the main checkout first, the worktree only gets publish.install.')
  }

  // Folders the worktree needs but does not track (publish.link), shared from the repository while the checks run.
  for (const relPath of settings.link) {
    const source = join(repo, relPath)
    const target = join(ctx.wt, relPath)
    if (!existsSync(source)) say(`  link ${relPath}: skipped, it does not exist in ${repo}`)
    else if (existsSync(target)) say(`  link ${relPath}: skipped, the worktree already has it`)
    else {
      symlinkSync(source, target)
      ctx.links.push(target)
      say(`  link ${relPath}: shared from ${repo} for the checks`)
    }
  }

  check(ctx, 'install', 'install', settings.install, forced)
  if (changeNotes(changed, settings).includes('schema')) {
    if (!settings.migrate) say('NOTE: publish.migrate is empty, so the schema was not migrated for the checks.')
    else if (!settings.scratchDatabase) say('NOTE: publish.migrate is set but publish.scratchDatabase is not: nothing migrated. Migrations never run against a real database.')
    else check(ctx, 'migrate', 'migration of the scratch database', settings.migrate, forced)
  }
  check(ctx, 'typecheck', 'typecheck of the merged tree', settings.typecheck, forced)
  if (!settings.lint) say('  skipped: publish.lint is empty, so no lint ran')
  else if (!addedFiles.length) say('  skipped: no changed file to lint')
  else {
    const files = settings.lintFiles ? addedFiles.filter(file => new RegExp(settings.lintFiles).test(file)) : addedFiles
    if (!files.length) say('  skipped: no changed file matches publish.lintFiles')
    else check(ctx, 'lint', 'lint of the changed files', expandPlaceholders(settings.lint, { files }), forced)
  }
  if (!settings.scratchDatabase) say('NOTE: publish.scratchDatabase is empty: the suite runs with no DATABASE_URL.')
  check(ctx, 'test', 'full suite of the merged tree', settings.test, forced)
  removeLinks(ctx)

  const identity = settings.commitName ? ['-c', `user.name=${settings.commitName}`, '-c', `user.email=${settings.commitEmail}`] : []
  if (!settings.commitName) say('commit: the repository\'s own git identity (publish.commitName is empty)')
  const body = readFileSync(msgFile, 'utf8').replace(/\s+$/, '') + (settings.attribution.length ? `\n\n${settings.attribution.join('\n')}` : '') + '\n'
  say('commit:')
  const committed = git(ctx.wt, [...identity, 'commit', '-q', '-F', '-'], body)
  if (!committed.ok) stop(ctx, 1, `commit failed:\n${committed.output}`)

  say(`push ${settings.remote} ${crewBranch}:`)
  const pushed = git(ctx.wt, ['push', '-q', settings.remote, crewBranch])
  if (!pushed.ok) stop(ctx, 1, `push failed (the commit is in ${ctx.wt}; push it by hand):\n${pushed.output}`)
  say('  pushed')

  let pullRequest = `skipped: publish.pr is empty; open the pull request by hand (base ${settings.base}, head ${crewBranch}, body ${prFile})`
  if (settings.pr) {
    say('pull request:')
    const values = { base: settings.base, branch: crewBranch, title, pr: prFile, slug }
    const made = shell(ctx, 'pr', expandPlaceholders(settings.pr, values))
    if (!made.ok) stop(ctx, 1, `the pull request command failed (the branch is pushed; log ${made.log}):\n${tail(made.output, 12)}`)
    pullRequest = tail(made.output, 1)
    say(`  ${pullRequest}`)
  } else say(`  ${pullRequest}`)

  say(`published ${crewBranch} to ${settings.remote}: ${changed.length} file(s) on ${baseRef}`)
  if (forced.length) say(`  FORCE=1: pushed past the failed ${forced.join(', ')}`)
  say(`  worktree ${ctx.wt}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
}
