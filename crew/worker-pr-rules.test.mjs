// The worker's rules on pull requests, publishing and worktrees (card mw9q0ok9avmno17r5el): workers push their branch and never
// open a pull request or publish; a rebase keeps the branch name; old worktrees of a card are removed after a rebase. Reads the
// kit's templates. Run: node --test crew/worker-pr-rules.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')

test('the worker prompt says a worker never opens a pull request and never publishes: Boss does', () => {
  const prompts = read('PROMPTS.md.tmpl')
  assert.match(prompts, /never open a pull request/i)
  assert.match(prompts, /never run `?crew publish`?/i)
})

test('a rebase keeps the same branch name; a new branch is reported to Boss on the card', () => {
  const prompts = read('PROMPTS.md.tmpl')
  assert.match(prompts, /rebase[^\n]*same branch name/i)
  assert.match(prompts, /tell Boss on the card/i)
})

test('after a rebase the worker removes the old worktrees of the same card: one worktree per card', () => {
  const prompts = read('PROMPTS.md.tmpl')
  assert.match(prompts, /one worktree per card/i)
  assert.match(prompts, /remove the old worktrees? of the same card/i)
})

test('WORKFLOW Phase 3 no longer has the worker open the pull request: the branch is the worker’s, Boss opens it', () => {
  const workflow = read('WORKFLOW.md')
  assert.doesNotMatch(workflow, /One pull request per main task, named with the task number first/)
  assert.match(workflow, /One branch per main task, named with the task number first; Boss opens the pull request/)
})
