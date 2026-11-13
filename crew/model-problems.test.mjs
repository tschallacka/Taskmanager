// crew.json that still names the bare model alias "haiku" is a problem the kit reports (card mwc5aicfyb9r0fvopvf):
// Claude Code no longer accepts that name, so an owner's crew.json with it stops every agent. The test runs the real
// config.mjs in a child process, with CREW_HOME pointing at a crew.json made from the example, and reads modelProblems.
//   node --test crew/model-problems.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** The modelProblems that config.mjs reports for a crew.json with these "models". */
function problemsFor(models) {
  const home = mkdtempSync(join(tmpdir(), 'wick-models-'))
  try {
    const example = JSON.parse(readFileSync(join(here, 'crew.config.example.json'), 'utf8'))
    writeFileSync(join(home, 'crew.json'), JSON.stringify({ ...example, models }))
    const probe = 'import("' + join(here, 'config.mjs') + '").then(m => console.log(JSON.stringify(m.modelProblems)))'
    const run = spawnSync(process.execPath, ['-e', probe], { env: { ...process.env, CREW_HOME: home }, encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    return JSON.parse(run.stdout.trim().split('\n').pop())
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

test('a default of the bare alias "haiku" is a problem, with the full id to use instead', () => {
  const problems = problemsFor({ default: 'haiku' })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /models\.default/)
  assert.match(problems[0], /"haiku"/)
  assert.match(problems[0], /claude-haiku-5-5/)
})

test('a person given the bare alias as a name is a problem', () => {
  const problems = problemsFor({ usher: 'haiku' })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /models\.usher/)
})

test('a person given the bare alias as the model of an object is a problem', () => {
  const problems = problemsFor({ wren: { provider: 'claude', model: 'haiku' } })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /models\.wren/)
})

test('the full model id is not a problem', () => {
  assert.deepEqual(problemsFor({ default: 'claude-haiku-5-5', usher: 'sonnet' }), [])
})
