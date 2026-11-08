// Bumps the Taskmanager version in package.json and in every literal copy of it, or tags the release.
//   node scripts/bump-version.mjs <patch|feature|breaking> [--dry-run]
//   node scripts/bump-version.mjs tag [--ref <commit>] [--push] [--dry-run]
// Plain node, no dependencies. Bump mode never runs git, npm or the network. Tag mode runs git only:
// it fetches origin master, creates one annotated tag and, with --push, pushes that one tag.
// Exit 0 on success, 1 when refused, 2 on a usage error.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Every literal copy of the version, as a pattern with the old version in group 2. A listed file
// with no such line is reported as `no literal copy`, not refused: its version comes from package.json.
// Add a file here when another literal copy appears.
const VERSION_COPIES = [
  { file: 'nix/arnotes.nix', pattern: /(\bversion = ")(\d+\.\d+\.\d+)(";)/g },
  { file: 'nix/packages.nix', pattern: /(\bversion = ")(\d+\.\d+\.\d+)(";)/g },
  { file: 'nix/schema.nix', pattern: /(\bversion = ")(\d+\.\d+\.\d+)(";)/g },
  { file: 'server/api/mcp/index.post.ts', pattern: /(\bSERVER_VERSION = ')(\d+\.\d+\.\d+)(')/g }
]

const KINDS = ['patch', 'feature', 'breaking']
const USAGE = 'usage: bump-version.mjs <patch|feature|breaking> [--dry-run]\n'
  + '       bump-version.mjs tag [--ref <commit>] [--push] [--dry-run]'

// A refusal: the reason is printed and nothing is written. Exit 1.
class Refusal extends Error {}
// A usage error: the usage is printed. Exit 2.
class Usage extends Error {}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

function parseSemver(text, where) {
  const match = SEMVER.exec(text)
  if (!match) {
    throw new Refusal(`${where}: "${text}" is not a plain x.y.z version (no prerelease or build suffix)`)
  }
  return match.slice(1).map(Number)
}

// While the major is 0, a breaking change bumps the minor; the move to 1.0.0 is made by hand.
function nextVersion([x, y, z], kind) {
  if (kind === 'patch') return [x, y, z + 1]
  if (kind === 'feature') return [x, y + 1, 0]
  if (x === 0) return [0, y + 1, 0]
  return [x + 1, 0, 0]
}

const format = version => version.join('.')
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function bumpRelease(kind, args) {
  let dryRun = false
  for (const arg of args) {
    if (arg === '--dry-run') dryRun = true
    else throw new Usage(`unknown argument: ${arg}\n${USAGE}`)
  }

  const packagePath = join(ROOT, 'package.json')
  const packageText = readFileSync(packagePath, 'utf8')
  const oldVersion = parseSemver(JSON.parse(packageText).version, 'package.json')
  const next = nextVersion(oldVersion, kind)
  const oldText = format(oldVersion)
  const newText = format(next)

  // The top-level version line of package.json, found by its two-space indent so it cannot match a nested key.
  const versionLine = new RegExp(`^  "version": "${escapeRegExp(oldText)}"`, 'm')
  if (!versionLine.test(packageText)) {
    throw new Refusal('package.json: no top-level `  "version": "<x.y.z>"` line at two-space indent; change it by hand')
  }

  const lines = []
  if (kind === 'breaking' && oldVersion[0] === 0) {
    lines.push('major is 0: a breaking change bumps the minor (0.2.0), not the major')
  }

  // Everything is computed in memory first, so a refusal writes nothing.
  const writes = [{ path: packagePath, before: packageText, after: packageText.replace(versionLine, `  "version": "${newText}"`) }]
  lines.push('package.json: changed')

  for (const copy of VERSION_COPIES) {
    const path = join(ROOT, copy.file)
    if (!existsSync(path)) throw new Refusal(`${copy.file}: listed in VERSION_COPIES but missing`)
    const before = readFileSync(path, 'utf8')
    const hits = [...before.matchAll(copy.pattern)]
    if (hits.length === 0) {
      lines.push(`${copy.file}: no literal copy (reads package.json)`)
      continue
    }
    const copies = hits.filter(hit => hit[2] === oldText).length
    if (copies === 0) {
      lines.push(`${copy.file}: no copy of ${oldText}, left as it is`)
      continue
    }
    const after = before.replace(copy.pattern, (all, start, version, end) => (version === oldText ? `${start}${newText}${end}` : all))
    lines.push(`${copy.file}: changed (${copies} ${copies === 1 ? 'copy' : 'copies'})`)
    writes.push({ path, before, after })
  }

  // The re-scan: no listed file may still hold the old version in a version position.
  for (const write of writes) {
    const copy = VERSION_COPIES.find(entry => join(ROOT, entry.file) === write.path)
    if (copy && [...write.after.matchAll(copy.pattern)].some(hit => hit[2] === oldText)) {
      throw new Refusal(`${copy.file}: still holds ${oldText} after the bump; nothing written`)
    }
  }

  // In beta (major 0) breaking and feature give the same number; the kind is kept in this line and in the tag.
  const held = kind === 'breaking' && oldVersion[0] === 0
  lines.push(`version: ${oldText} -> ${newText} (${kind}${held ? ', held at 0.x: beta' : ''})`)
  if (dryRun) {
    lines.push('dry run: nothing written')
  } else {
    for (const write of writes) {
      if (write.after !== write.before) writeFileSync(write.path, write.after)
    }
  }
  console.log(lines.join('\n'))
}

// Only git's own environment for the repository this script sits in; a GIT_DIR from a hook must not redirect it.
function git(args) {
  const env = { ...process.env }
  delete env.GIT_DIR
  delete env.GIT_WORK_TREE
  delete env.GIT_INDEX_FILE
  return execFileSync('git', args, { cwd: ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function gitOk(args) {
  const env = { ...process.env }
  delete env.GIT_DIR
  delete env.GIT_WORK_TREE
  delete env.GIT_INDEX_FILE
  return spawnSync('git', args, { cwd: ROOT, env, stdio: 'ignore' }).status === 0
}

function tagRelease(args) {
  let ref = 'HEAD'
  let push = false
  let dryRun = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--ref') {
      if (!args[i + 1]) throw new Usage(`--ref needs a commit\n${USAGE}`)
      ref = args[++i]
    } else if (arg === '--push') push = true
    else if (arg === '--dry-run') dryRun = true
    else throw new Usage(`unknown argument: ${arg}\n${USAGE}`)
  }

  let sha
  try {
    sha = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
  } catch {
    throw new Refusal(`${ref} is not a commit in this repository`)
  }

  try {
    git(['fetch', '--quiet', 'origin', 'master'])
  } catch (error) {
    throw new Refusal(`git fetch origin master failed; origin/master is needed to check the commit: ${String(error.stderr ?? error.message).trim()}`)
  }
  if (!gitOk(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/master'])) {
    throw new Refusal('origin/master is missing; run git fetch origin master')
  }
  if (!gitOk(['merge-base', '--is-ancestor', sha, 'refs/remotes/origin/master'])) {
    throw new Refusal(`${sha.slice(0, 7)} is not on origin/master; a tag must never point at an unmerged commit`)
  }

  const packageJson = JSON.parse(git(['show', `${sha}:package.json`]))
  const version = format(parseSemver(packageJson.version, `package.json at ${sha.slice(0, 7)}`))
  const tag = `v${version}`
  if (gitOk(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`])) {
    throw new Refusal(`tag ${tag} already exists; tags are never moved or overwritten`)
  }

  const subject = git(['log', '-1', '--format=%s', sha])
  const short = git(['rev-parse', '--short', sha])
  // The publisher writes `Version old -> new (kind[, held at 0.x: beta]).` in the commit message; its kind goes into the tag.
  const kindLine = /^Version (\S+) -> (\S+) \((patch|feature|breaking)(?:, held at 0\.x: beta)?\)\.$/m.exec(git(['log', '-1', '--format=%B', sha]))
  if (kindLine && kindLine[2] !== version) {
    throw new Refusal(`the commit's Version line says ${kindLine[2]}, but package.json at ${short} says ${version}`)
  }
  const kind = kindLine ? kindLine[3] : null
  const tagMessage = `Taskmanager ${version}${kind ? ` (${kind})` : ''}\n${subject}`
  if (dryRun) {
    console.log(`would tag ${tag} at ${short}\n${tagMessage.split('\n')[0]}\ndry run: no tag created`)
    return
  }

  git(['tag', '-a', tag, sha, '-m', tagMessage])
  console.log(`tagged ${tag} at ${short}`)

  if (push) {
    try {
      git(['push', 'origin', `refs/tags/${tag}`])
    } catch (error) {
      throw new Refusal(`git push origin ${tag} failed; the tag stays local: ${String(error.stderr ?? error.message).trim()}`)
    }
    console.log(`pushed ${tag} to origin`)
  }
}

try {
  const [command, ...rest] = process.argv.slice(2)
  if (command === 'tag') tagRelease(rest)
  else if (KINDS.includes(command)) bumpRelease(command, rest)
  else throw new Usage(USAGE)
} catch (error) {
  if (error instanceof Usage) {
    console.error(error.message)
    process.exit(2)
  }
  console.error(error instanceof Refusal ? error.message : `bump-version: ${error.message}`)
  process.exit(1)
}
