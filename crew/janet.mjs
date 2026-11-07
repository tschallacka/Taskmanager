#!/usr/bin/env node
// Janet Janitor: cleans up what a worker leaves behind once the worker is done with a card.
//
//   crew janet clean plan <who> <card> [--dry-run] [--worktree <path>]   works out the plan, deletes nothing
//   crew janet clean run  <who> <card> [--dry-run] [--worktree <path>]   deletes, but only a granted plan
//
// The safety rules (the Janet card, and CREW.md rule 7b):
// - nothing is deleted without `cleaning granted` on the plan subtask, and only the steps of that plan;
// - a step is only what the worker put on its scratch list (`.crew-scratch`, in the worker's work folder or
//   in its worktree), and only inside the worker's own folders: never a foreign folder, never a tracked repo file;
// - a worktree and its branch go only when the branch is merged into the base and no pull request is open;
//   never the shared checkout, never a branch with unmerged commits, never an open or unknown pull request;
// - the database, credentials and other workers' folders are never touched: the kit has no step for them.
//
// The logic is pure where it can be (the git, pull request and board calls are passed in), so kit.test.mjs can
// run it against a fake worktree. Only the command line at the bottom reads crew.json.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCRATCH_LIST = '.crew-scratch'
export const PLAN_TITLE = '[Clean plan]'
export const GRANTED = 'cleaning granted'
export const DONE = 'clean done'
const PROTECTED_BRANCHES = ['main', 'master', 'develop']

// The worker's scratch list: one path per line, relative to its work folder or absolute. `#` starts a comment.
export function readScratchList(text) {
  return text.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'))
}

// True when target is strictly inside root (not root itself, not outside it).
export function insideRoot(root, target) {
  const rel = relative(resolve(root), resolve(target))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

// The two names from the command line become paths (the work folder, the plan folder), so they are checked before
// anything else. `who` must be a person of this crew and not Janet herself; `cardId` is a board id, letters and digits.
// Returns the reason it is refused, or null.
export function checkIds(who, cardId, people) {
  if (!/^[a-z][a-z0-9-]*$/.test(who ?? '')) return `"${who}" is not a person key`
  if (who === 'janet') return 'Janet does not clean up after herself'
  if (!people || !Object.prototype.hasOwnProperty.call(people, who)) return `"${who}" is not a person of this crew`
  if (!/^[A-Za-z0-9]+$/.test(cardId ?? '')) return `"${cardId}" is not a card id`
  return null
}

// Re-checked at the moment of each removal, not only when the plan was made: the target must still be a plain file or
// folder inside one of the worker's roots (the work folder, the worktree), and no link may have taken its place.
export function assertRemovable(step, roots) {
  if (!['file', 'dir'].includes(step.kind)) return
  if (!roots.some(root => insideRoot(root, step.target))) {
    throw new Error(`refused: ${step.target} is outside the worker's folders`)
  }
  if (!existsSync(step.target)) return
  const stat = lstatSync(step.target)
  if (stat.isSymbolicLink()) throw new Error(`refused: ${step.target} is now a symbolic link`)
  if (stat.isDirectory() !== (step.kind === 'dir')) throw new Error(`refused: ${step.target} is no longer a ${step.kind}`)
}

// The base branch: origin's default when it is known, else `main`, else `master`. A repository with none of them has
// no base to merge into, so nothing can be shown as merged: that is an error, not a guess.
export function baseBranchOf(repoRoot, git) {
  const origin = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], repoRoot)
  if (origin.status === 0 && origin.stdout.trim()) return origin.stdout.trim().replace(/^origin\//, '')
  for (const name of ['main', 'master']) {
    if (git(['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], repoRoot).status === 0) return name
  }
  throw new Error('no base branch found: the repository has no origin default, no main and no master')
}

// `git worktree list --porcelain`, as entries { path, branch } (branch is the short name, or null when detached).
export function parseWorktrees(text) {
  return text.split('\n\n').map(block => block.trim()).filter(Boolean).map((block) => {
    const entry = { path: '', branch: null }
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) entry.path = line.slice('worktree '.length)
      if (line.startsWith('branch refs/heads/')) entry.branch = line.slice('branch refs/heads/'.length)
    }
    return entry
  })
}

// The worktree of a card: the one whose branch or folder carries the card id (the branch is named with the task
// number first, WORKFLOW.md Phase 3). Several matches are ambiguous: none is chosen, and the caller must pass one.
export function findWorktree(entries, cardId, repoRoot) {
  const matches = entries.filter(entry => resolve(entry.path) !== resolve(repoRoot)
    && ((entry.branch ?? '').includes(cardId) || entry.path.includes(cardId)))
  return matches.length === 1 ? matches[0] : null
}

// One line of a plan step, as the board stores it in the step subtask's title.
export function stepTitle(step) {
  return `[step] ${step.kind}: ${step.target}`
}

// The plan's hash: over the kinds and targets, in order. The granted plan and a fresh plan must match exactly.
export function planHash(steps) {
  return createHash('sha256').update(JSON.stringify(steps.map(step => [step.kind, step.target]))).digest('hex').slice(0, 16)
}

/**
 * Works out what may be removed. Nothing is deleted here.
 * @param {object} p
 * @param {string} p.who the worker's key
 * @param {string} p.cardId the card
 * @param {string} p.repoRoot the product repository (the shared checkout, never removed)
 * @param {string} p.workFolder the worker's work folder (<crew home>/work/<who>)
 * @param {string[]} p.scratch the entries of the worker's scratch list
 * @param {object|null} p.worktree { path, branch } or null
 * @param {string} p.base the base branch the worktree's branch must be merged into
 * @param {(args: string[], cwd: string) => {status: number, stdout: string}} p.git runs git
 * @param {(branch: string) => 'none'|'open'|'closed'|'merged'|'unknown'} p.prState the pull request state of a branch
 */
export function buildPlan(p) {
  const steps = []
  const refused = []
  const deny = (target, reason) => refused.push({ target, reason })

  // The browser context and tabs of the worker: closed by the kit, nothing on disk.
  steps.push({ kind: 'browser', target: p.who, reason: 'close the browser tabs and context' })

  const roots = [resolve(p.workFolder)]
  if (p.worktree) roots.push(resolve(p.worktree.path))

  for (const entry of p.scratch) {
    const target = resolve(p.workFolder, entry)
    const root = roots.find(r => insideRoot(r, target))
    if (!root) {
      deny(entry, 'outside the worker\'s own folders: not deleted')
      continue
    }
    if (!existsSync(target)) continue
    if (lstatSync(target).isSymbolicLink()) {
      deny(entry, 'a symbolic link: not followed, not deleted')
      continue
    }
    const isDir = statSync(target).isDirectory()
    if (isDir && existsSync(join(target, '.git'))) {
      deny(entry, 'a folder with its own repository: not deleted')
      continue
    }
    if (p.worktree && resolve(root) === resolve(p.worktree.path)) {
      const rel = relative(root, target)
      const tracked = p.git(['ls-files', '--', rel], root)
      if (tracked.status !== 0 || tracked.stdout.trim()) {
        deny(entry, 'a tracked file or a folder with tracked files of the repository: not deleted')
        continue
      }
    }
    steps.push({ kind: isDir ? 'dir' : 'file', target, reason: `on the worker's scratch list (${entry})` })
  }

  // The scratch lists themselves go with the scratch they name.
  const lists = [join(p.workFolder, SCRATCH_LIST), p.worktree ? join(p.worktree.path, SCRATCH_LIST) : null]
  for (const list of lists) {
    if (list && existsSync(list) && !steps.some(s => s.target === list)) {
      steps.push({ kind: 'file', target: list, reason: 'the worker\'s scratch list' })
    }
  }

  if (!p.worktree) {
    refused.push({ target: '(worktree)', reason: 'no worktree found for this card: nothing to remove there' })
  } else {
    const { path, branch } = p.worktree
    if (resolve(path) === resolve(p.repoRoot)) {
      deny(path, 'the shared checkout: never removed')
    } else if (!branch) {
      deny(path, 'a detached worktree: no branch to check, not removed')
    } else if (PROTECTED_BRANCHES.includes(branch) || branch === p.base) {
      deny(branch, 'a shared branch: never removed')
    } else {
      const state = p.prState(branch)
      const merged = p.git(['merge-base', '--is-ancestor', branch, p.base], p.repoRoot).status === 0
      // Untracked scratch files of this plan are removed before the worktree; anything else untracked or changed is dirt.
      const planned = new Set(steps.filter(s => s.kind === 'file' || s.kind === 'dir').map(s => resolve(s.target)))
      const dirty = p.git(['status', '--porcelain'], path).stdout.split('\n').filter(Boolean).some((line) => {
        const rel = line.slice(3).replace(/\/$/, '')
        return !planned.has(resolve(path, rel))
      })
      if (state === 'open' || state === 'unknown') {
        deny(branch, state === 'open' ? 'has an open pull request: not removed' : 'pull request state unknown: not removed')
      } else if (!merged) {
        deny(branch, `has commits not merged into ${p.base}: not removed`)
      } else if (dirty) {
        deny(path, 'has uncommitted changes: not removed')
      } else {
        steps.push({ kind: 'worktree', target: path, reason: `branch ${branch} is merged into ${p.base}` })
        steps.push({ kind: 'branch', target: branch, reason: `merged into ${p.base}, no open pull request` })
      }
    }
  }

  return { steps, refused, hash: planHash(steps) }
}

// Renders the plan for a person: the numbered steps, then what was left and why.
export function renderPlan(plan) {
  const lines = ['Steps (in order):']
  plan.steps.forEach((step, i) => lines.push(`${i + 1}. ${stepTitle(step)}  (${step.reason})`))
  if (!plan.steps.length) lines.push('(none)')
  lines.push('', 'Left, and why:')
  for (const item of plan.refused) lines.push(`- ${item.target}: ${item.reason}`)
  if (!plan.refused.length) lines.push('(nothing)')
  lines.push('', `plan hash: ${plan.hash}`)
  return lines.join('\n')
}

// The plan subtask of a card (`[Clean plan] <card title>`), or null when Janet has not made one yet.
export function findPlanSubtask(card) {
  return (card.subtasks ?? []).find(sub => (sub.title ?? '').startsWith(PLAN_TITLE)) ?? null
}

// Reads the steps the board holds: `[step] kind: target` titles, in order.
export function stepsOnBoard(planCard) {
  const steps = []
  for (const sub of planCard.subtasks ?? []) {
    const match = /^\[step\] (browser|file|dir|worktree|branch): (.+)$/.exec(sub.title ?? '')
    if (match) steps.push({ kind: match[1], target: match[2], id: sub.id })
  }
  return steps
}

/**
 * Runs a granted plan: refuses unless the plan subtask carries `cleaning granted` and its steps are the steps the
 * safety rules allow now (same hash). Deletes only what the steps name, in order, and ticks each one on the board.
 */
export function runPlan({ plan, board, dryRun, execute, log }) {
  const planCard = board.getTask(plan.planId)
  const tags = planCard.tags ?? []
  if (!tags.includes(GRANTED)) {
    throw new Error(`refused: the plan subtask does not carry "${GRANTED}" (the checker grants it)`)
  }
  const onBoard = stepsOnBoard(planCard)
  const boardHash = planHash(onBoard)
  if (boardHash !== plan.hash) {
    throw new Error(`refused: the granted steps (${boardHash}) are not the steps allowed now (${plan.hash}): the plan changed since the grant, replan`)
  }
  for (const step of plan.steps) {
    log(`${dryRun ? 'would do' : 'doing'}: ${stepTitle(step)}`)
    if (dryRun) continue
    execute(step)
    const boardStep = onBoard.find(s => s.kind === step.kind && s.target === step.target)
    if (boardStep) {
      board.updateTask(boardStep.id, { completed: true })
      board.postUpdate(boardStep.id, `Done: ${step.kind} ${step.target}`)
    }
  }
  if (!dryRun) {
    board.updateTask(plan.planId, { tags: [...tags.filter(t => t !== DONE), DONE] })
    board.postUpdate(plan.planId, `Clean done: ${plan.steps.length} step(s) done, ${plan.refused.length} item(s) left, see the list above.`)
  }
  return { done: plan.steps.length, dryRun }
}

// ── The command line ─────────────────────────────────────────────────────────

function git(args, cwd) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return { status: run.status ?? 1, stdout: run.stdout ?? '' }
}

// GitHub's view of a branch's pull requests. Anything but a clear answer is 'unknown', which keeps the branch.
export function prStateFromGh(branch, repoRoot) {
  const run = spawnSync('gh', ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'state'], { cwd: repoRoot, encoding: 'utf8' })
  if (run.status !== 0) return 'unknown'
  let rows
  try {
    rows = JSON.parse(run.stdout || '[]')
  } catch {
    return 'unknown'
  }
  if (rows.some(row => row.state === 'OPEN')) return 'open'
  if (rows.some(row => row.state === 'MERGED')) return 'merged'
  if (rows.some(row => row.state === 'CLOSED')) return 'closed'
  return 'none'
}

function boardCall(who, tool, args, kit) {
  const run = spawnSync(process.execPath, [join(kit, 'crew.mjs'), who, 'mcp', tool, JSON.stringify(args)], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`board call ${tool} failed: ${(run.stderr || run.stdout).trim().slice(0, 300)}`)
  try {
    return JSON.parse(run.stdout)
  } catch {
    throw new Error(`board call ${tool} did not return JSON`)
  }
}

function postUpdateFile(who, id, text, kit, work) {
  const file = join(work, 'janet-update.md')
  mkdirSync(work, { recursive: true })
  writeFileSync(file, text)
  const run = spawnSync(process.execPath, [join(kit, 'crew.mjs'), who, 'update', id, file, '--internal'], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`posting the update failed: ${(run.stderr || run.stdout).trim().slice(0, 300)}`)
}

function usage(kit) {
  return `usage: crew janet clean plan|run <who> <card> [--dry-run] [--worktree <path>]   (kit ${kit})`
}

async function main(argv) {
  const { config, here } = await import('./config.mjs')
  const kit = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '')
  const flags = { dryRun: argv.includes('--dry-run'), worktree: null }
  const at = argv.indexOf('--worktree')
  if (at >= 0) flags.worktree = argv[at + 1]
  const args = argv.filter((a, i) => !a.startsWith('--') && (at < 0 || (i !== at && i !== at + 1)))
  const [verb, mode, who, cardId] = args
  if (verb !== 'clean' || !['plan', 'run'].includes(mode) || !who || !cardId) {
    console.error(usage(kit))
    return 2
  }
  // Before any path is built from them: a `..` or a slash here would make the work folder the crew home itself.
  const refusal = checkIds(who, cardId, config.people)
  if (refusal) {
    console.error(`refused: ${refusal}`)
    return 2
  }
  const repoRoot = config.product.repo
  if (!repoRoot) throw new Error('product.repo is not set in crew.json: Janet needs the repository to find worktrees')
  const workFolder = join(here, 'work', who)
  const scratch = existsSync(join(workFolder, SCRATCH_LIST)) ? readScratchList(readFileSync(join(workFolder, SCRATCH_LIST), 'utf8')) : []
  const entries = parseWorktrees(git(['worktree', 'list', '--porcelain'], repoRoot).stdout)
  const worktree = flags.worktree
    ? entries.find(e => resolve(e.path) === resolve(flags.worktree)) ?? { path: resolve(flags.worktree), branch: null }
    : findWorktree(entries, cardId, repoRoot)
  const base = baseBranchOf(repoRoot, git)
  const plan = buildPlan({
    who, cardId, repoRoot, workFolder, scratch, worktree, base, git,
    prState: branch => prStateFromGh(branch, repoRoot)
  })
  if (mode === 'plan') {
    const out = join(here, 'work', 'janet', cardId)
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'plan.json'), JSON.stringify(plan, null, 2))
    console.log(renderPlan(plan))
    return 0
  }
  // run: the plan subtask on the board must carry the grant and match the steps allowed now.
  const card = boardCall('janet', 'get_task', { id: cardId }, kit)
  const planSub = findPlanSubtask(card)
  if (!planSub) throw new Error('refused: no "[Clean plan]" subtask on the card: Janet makes the plan first')
  const board = {
    getTask: id => boardCall('janet', 'get_task', { id }, kit),
    updateTask: (id, patch) => boardCall('janet', 'update_task', { id, ...patch }, kit),
    postUpdate: (id, text) => postUpdateFile('janet', id, text, kit, join(here, 'work', 'janet', cardId))
  }
  const roots = [resolve(workFolder), ...(worktree ? [resolve(worktree.path)] : [])]
  const execute = (step) => {
    if (step.kind === 'browser') {
      const run = spawnSync(process.execPath, [join(kit, 'crew.mjs'), step.target, 'browser', 'done'], { stdio: 'inherit' })
      if (run.status !== 0) throw new Error(`browser done failed for ${step.target}`)
    } else if (step.kind === 'file' || step.kind === 'dir') {
      // Checked again now, at the removal: the plan may be old, and a link may have taken the target's place since.
      assertRemovable(step, roots)
      if (existsSync(step.target)) rmSync(step.target, { recursive: step.kind === 'dir', force: false })
    } else if (step.kind === 'worktree') {
      const run = git(['worktree', 'remove', step.target], repoRoot)
      if (run.status !== 0) throw new Error(`git worktree remove refused ${step.target}`)
    } else if (step.kind === 'branch') {
      const run = git(['branch', '-d', step.target], repoRoot)
      if (run.status !== 0) throw new Error(`git branch -d refused ${step.target}`)
    }
  }
  const result = runPlan({ plan: { ...plan, planId: planSub.id }, board, dryRun: flags.dryRun, execute, log: line => console.log(line) })
  console.log(flags.dryRun ? 'dry run: nothing removed' : `done: ${result.done} step(s)`)
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).then(code => process.exit(code), (err) => {
    console.error(err.message)
    process.exit(1)
  })
}
