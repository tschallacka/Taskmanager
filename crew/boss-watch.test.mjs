// Tests for Boss's watches: `crew activity`, `crew watch-crew`, `crew boss-mentions` (the author filter), Boss's Stop hook
// and its settings file. Run from the repo root: node --test crew/boss-watch.test.mjs
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, test } from 'node:test'
import { describeEntries, listenersFrom, piaProjectsDir, stateOf, activityRows, isPiaProcess } from './activity.mjs'
import { isTransient, look, problemsOf, watchLoop } from './watch-crew.mjs'
import { BOSS_AUTHOR, PM_AUTHOR, mentionLines } from './mentions.mjs'
import { bossHooks, writeBossHooks } from './boss-session.mjs'

const KIT = fileURLToPath(new URL('.', import.meta.url))
const HOOK = join(KIT, 'boss-stop-hook.sh')
const tempDir = prefix => mkdtempSync(join(tmpdir(), prefix))
const NOW = Date.parse('2026-11-09T12:00:00Z')

describe('activity: the rows read from the transcripts', () => {
  test('Pia\'s Claude folder is the crew home\'s pia-session path with / and . turned into -', () => {
    assert.equal(
      piaProjectsDir('/srv/agents/x/.config/crew', '/srv/agents/x'),
      '/srv/agents/x/.claude/projects/-srv-agents-x--config-crew-pia-session'
    )
  })

  test('a step is the newest assistant message: a tool call still open, a tool answered, or plain text', () => {
    assert.equal(describeEntries([{ message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } }]).kind, 'tool-open')
    const answered = [
      { message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } },
      { message: { role: 'user', content: [{ type: 'tool_result' }] } }
    ]
    assert.equal(describeEntries(answered).kind, 'tool-done')
    assert.equal(describeEntries([{ message: { role: 'assistant', content: [{ type: 'text', text: 'done  now' }] } }]).what, 'done now')
  })

  test('the states: listening, handedback, ended, running, silent and working', () => {
    assert.equal(stateOf({ last: { kind: 'tool-open', what: 'Bash: listen.mjs susy 600' }, mins: 1, listening: false }), 'listening')
    assert.equal(stateOf({ last: { kind: 'text', what: 'x' }, mins: 1, listening: true }), 'listening')
    assert.equal(stateOf({ last: { kind: 'text', what: 'SubagentHandback: done' }, mins: 1, listening: false }), 'handedback')
    assert.equal(stateOf({ last: { kind: 'text', what: 'x' }, mins: 1, listening: false }), 'ended')
    assert.equal(stateOf({ last: { kind: 'tool-open', what: 'Bash: test' }, mins: 6, listening: false }), 'running')
    assert.equal(stateOf({ last: { kind: 'tool-open', what: 'Bash: test' }, mins: 16, listening: false }), 'silent')
    assert.equal(stateOf({ last: { kind: 'tool-done', what: 'Bash: ls' }, mins: 2, listening: false }), 'working')
  })

  test('the keys of the listeners and crew commands running, from the command lines', () => {
    const keys = listenersFrom([
      ['node', '/kit/listen.mjs', 'susy', '600'],
      ['node', '/kit/crew.mjs', 'wren', 'update', 'x'],
      ['sh', '-c', 'ls']
    ])
    assert.deepEqual([...keys].sort(), ['susy', 'wren'])
  })

  test('Pia\'s own process is recognised by its command line', () => {
    assert.equal(isPiaProcess(['claude', '--continue', '--model', 'haiku']), true)
    assert.equal(isPiaProcess(['claude', '--continue']), false)
  })

  test('rows: a subagent\'s newest transcript wins, and Pia\'s row says whether her listener runs under her', () => {
    const root = join(tempDir('activity-'), 'projects')
    const session = join(root, 'session-1')
    mkdirSync(join(session, 'subagents'), { recursive: true })
    const subagents = join(session, 'subagents')
    const old = join(subagents, 'agent-old.jsonl')
    const fresh = join(subagents, 'agent-fresh.jsonl')
    writeFileSync(old, `${JSON.stringify({ message: { role: 'assistant', content: [{ type: 'text', text: 'old' }] } })}\n`)
    writeFileSync(join(subagents, 'agent-old.meta.json'), JSON.stringify({ agentType: 'taskmanager-maintenance-susy-secretary', description: 'old' }))
    writeFileSync(fresh, `${JSON.stringify({ message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'node listen.mjs susy 600' } }] } })}\n`)
    writeFileSync(join(subagents, 'agent-fresh.meta.json'), JSON.stringify({ agentType: 'taskmanager-maintenance-susy-secretary', description: 'fresh' }))
    utimesSync(old, new Date(NOW - 60_000), new Date(NOW - 60_000))
    utimesSync(fresh, new Date(NOW - 30_000), new Date(NOW - 30_000))
    const piaMain = join(root, 'pia-main.jsonl')
    writeFileSync(piaMain, `${JSON.stringify({ message: { role: 'assistant', content: [{ type: 'text', text: 'idle' }] } })}\n`)
    utimesSync(piaMain, new Date(NOW - 3 * 60_000), new Date(NOW - 3 * 60_000))

    const rows = activityRows({ root, now: NOW, cmdlines: [['node', '/kit/listen.mjs', 'pia', '600']], alive: true })
    const susy = rows.find(r => r.key === 'susy')
    assert.equal(susy.state, 'listening')
    const pia = rows.find(r => r.key === 'pia')
    assert.equal(pia.state, 'working') // under 15 minutes Pia is working, listener or not
    assert.match(pia.what, /own listener running/)
  })
})

describe('watch-crew: what counts as trouble', () => {
  const row = (key, state, mins, what = '') => ({ key, state, mins, what })
  const healthy = [row('pia', 'working', 2, 'own listener running. x'), row('susy', 'listening', 4)]

  test('nothing printed when Pia and Susy are working', () => {
    assert.equal(problemsOf({ rows: healthy, alive: true }), '')
  })

  test('Pia gone, quiet for 20 minutes, no listener of her own, Susy missing or stuck', () => {
    assert.equal(problemsOf({ rows: [row('pia', 'gone', 1), row('susy', 'listening', 1)], alive: false }), ' pia-session-gone;')
    assert.match(problemsOf({ rows: [row('pia', 'listening', 25, 'own listener running. x'), row('susy', 'listening', 1)], alive: true }), /pia-quiet-25min/)
    assert.match(problemsOf({ rows: [row('pia', 'working', 2, 'NO own listener. x'), row('susy', 'listening', 1)], alive: true }), /pia-no-listener-in-her-session/)
    assert.match(problemsOf({ rows: [healthy[0]], alive: true }), /susy-not-running/)
    assert.match(problemsOf({ rows: [healthy[0], row('susy', 'ended', 12)], alive: true }), /susy-ended-12min/)
    assert.match(problemsOf({ rows: [healthy[0], row('susy', 'working', 25)], alive: true }), /susy-working-25min/)
  })

  test('a second look is asked for on a missing listener, or on Susy in a state other than working, running or listening', () => {
    assert.equal(isTransient(' pia-no-listener-in-her-session; '), true)
    assert.equal(isTransient(' susy-not-running; '), true)
    assert.equal(isTransient(' susy-ended-12min; '), true)
    assert.equal(isTransient(' susy-working-25min; '), false)
    assert.equal(isTransient(' pia-quiet-25min; '), false)
  })

  test('the loop prints when the list changes, confirms a transient one, and says when all is well again', async () => {
    const looks = [
      ' susy-ended-12min;', // transient: re-read after the confirm wait
      ' susy-ended-12min;',
      '',
      '',
      ' pia-quiet-25min;'
    ]
    const printed = []
    let confirms = 0
    await watchLoop({
      check: () => looks.shift(),
      print: text => printed.push(text),
      wait: async () => {},
      confirmWait: async () => { confirms++ },
      rounds: 4,
      clock: () => new Date('2026-11-09T12:03:00Z')
    })
    assert.equal(confirms, 1)
    assert.deepEqual(printed.map(line => line.replace(/^\d\d:\d\d /, '')), [
      'PROBLEM: susy-ended-12min;',
      'OK: Pia and Susy are working again',
      'PROBLEM: pia-quiet-25min;'
    ])
  })

  test('look reads the rows from a real folder and the given processes', () => {
    const root = join(tempDir('look-'), 'projects')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'main.jsonl'), `${JSON.stringify({ message: { role: 'assistant', content: [{ type: 'text', text: 'x' }] } })}\n`)
    const out = look({ root, cmdlines: [['claude', '--continue', '--model', 'haiku'], ['node', '/kit/listen.mjs', 'pia', '600']] })
    assert.equal(out, ' susy-not-running;')
  })
})

describe('boss-mentions: the author filter for Pia, Susy and Rita', () => {
  test('the agents that report to Boss pass, the crew-only lookalikes and people do not', () => {
    for (const author of ['crew pia (agent)', 'crew susy (agent)', 'crew rita (agent)', 'Pia Planner (agent)', 'Susy Secretary (agent)', 'Rita Reporter (agent)', 'fork abc-pia (agent)']) {
      assert.equal(BOSS_AUTHOR.test(author), true, author)
    }
    for (const author of ['crew wynn (agent)', 'Maria Pia', 'crew pia', 'Wren Worker (agent)']) {
      assert.equal(BOSS_AUTHOR.test(author), false, author)
    }
  })

  test('the PM-only filter still refuses the crew label (the existing bug is its own card)', () => {
    assert.equal(PM_AUTHOR.test('crew susy (agent)'), false)
  })

  test('a Susy update that tags @cato gives one line; the same update again is not repeated', () => {
    const task = { id: 'mw1', title: 'Card' }
    const updates = [{ id: 'u1', author: 'crew susy (agent)', body: 'poke wren, @cato please look' }]
    const first = mentionLines(task, updates, new Set(), BOSS_AUTHOR)
    assert.equal(first.length, 1)
    assert.match(first[0].line, /^@cato on mw1 "Card" by crew susy \(agent\): poke wren, @cato please look$/)
    assert.equal(mentionLines(task, updates, new Set(['u1']), BOSS_AUTHOR).length, 0)
  })
})

describe('Boss\'s session settings', () => {
  const options = { crewHome: '/crew', kitDir: '/kit' }

  test('the Stop hook names the kit, the crew home and the kit folder', () => {
    assert.equal(bossHooks(options).Stop[0].hooks[0].command, 'sh /kit/boss-stop-hook.sh /crew /kit')
  })

  test('a new folder gets settings.local.json with the hook; a second run changes nothing', () => {
    const session = tempDir('boss-session-')
    const first = writeBossHooks(session, options)
    assert.equal(first.changed, true)
    assert.equal(first.excluded, false)
    assert.equal(writeBossHooks(session, options).changed, false)
    const settings = JSON.parse(readFileSync(join(session, '.claude', 'settings.local.json'), 'utf8'))
    assert.deepEqual(Object.keys(settings), ['hooks'])
  })

  test('other keys and other Stop hooks are kept; the old kit hook is replaced', () => {
    const session = tempDir('boss-session-')
    mkdirSync(join(session, '.claude'), { recursive: true })
    const mine = { hooks: [{ type: 'command', command: 'echo mine' }] }
    writeFileSync(join(session, '.claude', 'settings.local.json'), JSON.stringify({
      permissions: { allow: ['Bash(ls)'] },
      hooks: { Stop: [mine, { hooks: [{ type: 'command', command: 'sh /old/boss-stop-hook.sh /x /old' }] }] }
    }))
    writeBossHooks(session, { crewHome: '/new', kitDir: '/kit2' })
    const settings = JSON.parse(readFileSync(join(session, '.claude', 'settings.local.json'), 'utf8'))
    assert.deepEqual(settings.permissions, { allow: ['Bash(ls)'] })
    assert.deepEqual(settings.hooks.Stop.filter(entry => !entry.hooks[0].command.includes('boss-stop-hook.sh')), [mine])
    const ours = settings.hooks.Stop.filter(entry => entry.hooks[0].command.includes('boss-stop-hook.sh'))
    assert.deepEqual(ours.map(entry => entry.hooks[0].command), ['sh /kit2/boss-stop-hook.sh /new /kit2'])
  })

  test('a git checkout keeps the settings file out of git, once', () => {
    const session = tempDir('boss-session-')
    mkdirSync(join(session, '.git', 'info'), { recursive: true })
    assert.equal(writeBossHooks(session, options).excluded, true)
    assert.equal(writeBossHooks(session, options).excluded, false)
    assert.equal(readFileSync(join(session, '.git', 'info', 'exclude'), 'utf8').split('\n').filter(line => line === '.claude/settings.local.json').length, 1)
  })

  test('a file that is not JSON is refused and left as it is', () => {
    const session = tempDir('boss-session-')
    mkdirSync(join(session, '.claude'), { recursive: true })
    writeFileSync(join(session, '.claude', 'settings.local.json'), '{ not json')
    assert.throws(() => writeBossHooks(session, options), /not valid JSON/)
    assert.equal(readFileSync(join(session, '.claude', 'settings.local.json'), 'utf8'), '{ not json')
  })
})

describe('boss-stop-hook.sh: the stop is blocked while a watch is down', () => {
  // Runs the hook the way Claude Code does: the event as JSON on stdin, the answer on stdout.
  function runHook(stdin = '{}', crew = '/crew') {
    const run = spawnSync('sh', [HOOK, crew, KIT.replace(/\/$/, '')], { input: stdin, encoding: 'utf8' })
    return { status: run.status, stdout: run.stdout }
  }

  // Stand-ins for the two Monitors: a node process whose command line names the kit command.
  const fakes = []
  function fake(command) {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)', 'crew.mjs', command], { stdio: 'ignore' })
    fakes.push(child)
    return child
  }
  after(() => {
    for (const child of fakes) child.kill()
  })

  test('with neither watch running, the stop is blocked, naming both Monitor calls, as valid JSON', () => {
    const run = runHook()
    assert.equal(run.status, 0)
    const answer = JSON.parse(run.stdout)
    assert.equal(answer.decision, 'block')
    assert.match(answer.reason, /Monitor\(command: "CREW_HOME=\/crew node .*\/crew\.mjs boss-mentions"/)
    assert.match(answer.reason, /Monitor\(command: "CREW_HOME=\/crew node .*\/crew\.mjs watch-crew"/)
  })

  test('the second try after a block lets Boss stop (stop_hook_active), so it never loops', () => {
    const run = runHook('{"stop_hook_active":true}')
    assert.equal(run.status, 0)
    assert.equal(run.stdout, '')
  })

  test('with both watches running, the hook prints nothing and the stop goes through', async () => {
    fake('boss-mentions')
    fake('watch-crew')
    await new Promise(resolve => setTimeout(resolve, 400))
    const run = runHook()
    assert.equal(run.stdout, '')
  })
})
