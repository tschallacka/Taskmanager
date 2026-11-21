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

// The lines that still asked for a pull-request link (Nina's must, card mw9q0ok9avmno17r5el): a worker never opens one, so the
// evidence and the handover name the pushed branch, and Boss opens the pull request at publish.
const lineOf = (text, pattern) => text.split('\n').find(line => pattern.test(line)) ?? ''

test('the worker round attaches the pushed branch name as proof, not a pull request link', () => {
  const attach = lineOf(read('PROMPTS.md.tmpl'), /attach proof/)
  assert.match(attach, /pushed branch name/, 'the proof names the pushed branch')
  assert.doesNotMatch(attach, /pull request/i)
})

test('WORKFLOW step 5 Finish attaches the pushed branch name, not the pull request link', () => {
  const finish = lineOf(read('WORKFLOW.md'), /^5\. Finish/)
  assert.match(finish, /the pushed branch name/)
  assert.doesNotMatch(finish, /pull request link/)
})

test('the Pia review check asks that the branch is pushed and named right; Boss opens the pull request at publish', () => {
  const check = lineOf(read('WORKFLOW.md'), /^1\. Check against the brief/)
  assert.match(check, /the branch is pushed and named right; Boss opens the pull request at publish/)
  assert.doesNotMatch(check, /the pull request exists/)
})

test('the evidence rule and the handover format name the pushed branch, not a pull request', () => {
  const workflow = read('WORKFLOW.md')
  const evidence = lineOf(workflow, /Evidence rule/)
  assert.match(evidence, /pushed branch name/)
  assert.doesNotMatch(evidence, /pull request link/)
  const handover = lineOf(workflow, /One handover format/)
  assert.match(handover, /branch \(pushed, named right\)/)
  assert.doesNotMatch(handover, /branch and pull request/)
})

test('SKILL.md says Boss opens the pull request for one branch per main task', () => {
  const skill = lineOf(read('SKILL.md'), /Workers commit and push only their own branch/)
  assert.match(skill, /one branch per main task/)
  assert.match(skill, /Boss opens the pull request/)
  assert.doesNotMatch(skill, /one pull request per main task/)
})

test('the lines this change touches do not use the word tokens (the kit test forbids it in SKILL.md and the archive)', () => {
  const touched = [read('PROMPTS.md.tmpl'), read('WORKFLOW.md'), read('SKILL.md')].join('\n')
  assert.doesNotMatch(touched, /tokens/i)
})
