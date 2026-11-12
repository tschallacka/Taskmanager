// Tests for the PM's session hooks and the listener hook script.
// Run from the repo root: node --test crew/pia-session.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'
import { HOOK_NAME, piaHooks, shellWord, writePiaHooks } from './pia-session.mjs'

const KIT = fileURLToPath(new URL('.', import.meta.url))
const HOOK = join(KIT, HOOK_NAME)
const CREW = '/srv/crew home/acme'

const tempDir = prefix => mkdtempSync(join(tmpdir(), prefix))

describe('the hook entries', () => {
  test('a Stop and a SessionStart hook, both naming the hook script with the crew home and the kit', () => {
    const hooks = piaHooks({ crewHome: CREW, kitDir: '/srv/kit' })
    assert.equal(hooks.Stop[0].hooks[0].type, 'command')
    assert.equal(hooks.Stop[0].hooks[0].command, `sh /srv/kit/pia-listener-hook.sh stop '/srv/crew home/acme' /srv/kit`)
    assert.equal(hooks.SessionStart[0].hooks[0].command, `sh /srv/kit/pia-listener-hook.sh sessionstart '/srv/crew home/acme' /srv/kit`)
    assert.equal(hooks.SessionStart[0].matcher, 'startup|resume|compact')
  })

  test('shell words: plain paths unquoted, others single-quoted with the quote escaped', () => {
    assert.equal(shellWord('/srv/kit'), '/srv/kit')
    assert.equal(shellWord('/a b'), '\'/a b\'')
    assert.equal(shellWord('/it\'s'), '\'/it\'\\\'\'s\'')
  })
})

describe('writing the session settings', () => {
  const options = { crewHome: '/crew', kitDir: '/kit' }

  test('a new session: the file is created with the two hooks and nothing else', () => {
    const session = join(tempDir('pia-session-'), 'pia-session')
    const result = writePiaHooks(session, options)
    assert.equal(result.changed, true)
    const settings = JSON.parse(readFileSync(result.file, 'utf8'))
    assert.deepEqual(Object.keys(settings), ['hooks'])
    assert.deepEqual(Object.keys(settings.hooks).sort(), ['SessionStart', 'Stop'])
  })

  test('a second run changes nothing', () => {
    const session = tempDir('pia-session-')
    writePiaHooks(session, options)
    assert.equal(writePiaHooks(session, options).changed, false)
  })

  test('other keys and other hooks are kept; only this kit\'s hooks are replaced', () => {
    const session = tempDir('pia-session-')
    mkdirSync(join(session, '.claude'), { recursive: true })
    const other = { hooks: [{ type: 'command', command: 'echo mine' }] }
    writeFileSync(join(session, '.claude', 'settings.json'), JSON.stringify({
      permissions: { allow: ['Bash(ls)'] },
      env: { MCP_TIMEOUT: '60000' },
      hooks: { Stop: [other, { hooks: [{ type: 'command', command: 'sh /old/pia-listener-hook.sh stop /x /old' }] }] }
    }))
    writePiaHooks(session, { crewHome: '/new', kitDir: '/kit2' })
    const settings = JSON.parse(readFileSync(join(session, '.claude', 'settings.json'), 'utf8'))
    assert.deepEqual(settings.permissions, { allow: ['Bash(ls)'] })
    assert.deepEqual(settings.env, { MCP_TIMEOUT: '60000' })
    assert.deepEqual(settings.hooks.Stop.filter(entry => !entry.hooks[0].command.includes(HOOK_NAME)), [other])
    const ours = settings.hooks.Stop.filter(entry => entry.hooks[0].command.includes(HOOK_NAME))
    assert.equal(ours.length, 1)
    assert.equal(ours[0].hooks[0].command, `sh /kit2/pia-listener-hook.sh stop /new /kit2`)
  })

  test('a file that is not JSON is refused and left as it is', () => {
    const session = tempDir('pia-session-')
    mkdirSync(join(session, '.claude'), { recursive: true })
    writeFileSync(join(session, '.claude', 'settings.json'), '{ not json')
    assert.throws(() => writePiaHooks(session, options), /not valid JSON/)
    assert.equal(readFileSync(join(session, '.claude', 'settings.json'), 'utf8'), '{ not json')
  })
})

describe('the listener hook script', () => {
  // Runs the hook the way Claude Code does: the event as JSON on stdin, the answer on stdout.
  function runHook(event, stdin = '{}', crew = CREW) {
    const run = spawnSync('sh', [HOOK, event, crew, '/srv/kit'], { input: stdin, encoding: 'utf8' })
    return { status: run.status, stdout: run.stdout }
  }

  test('stop with no listener under the session blocks the stop and names the command to start', () => {
    const run = runHook('stop')
    assert.equal(run.status, 0)
    const answer = JSON.parse(run.stdout)
    assert.equal(answer.decision, 'block')
    assert.match(answer.reason, /run_in_background: true \(never nohup\)/)
    assert.match(answer.reason, /listen\.mjs' pia 600/)
  })

  test('the command in the answer keeps the crew home with a space in it, quoted', () => {
    const answer = JSON.parse(runHook('stop', '{}', '/srv/crew home/acme').stdout)
    assert.match(answer.reason, /CREW_HOME='\/srv\/crew home\/acme' node '\/srv\/kit\/listen\.mjs' pia 600/)
  })

  test('stop again after a block (stop_hook_active) lets her stop, so it never loops', () => {
    const run = runHook('stop', '{"stop_hook_active":true}')
    assert.equal(run.status, 0)
    assert.equal(run.stdout, '')
  })

  test('sessionstart adds one line of context telling her to start the listener first', () => {
    const answer = JSON.parse(runHook('sessionstart').stdout)
    assert.equal(answer.hookSpecificOutput.hookEventName, 'SessionStart')
    assert.match(answer.hookSpecificOutput.additionalContext, /start your own board listener/)
  })

  test('a listener that is a child of the session lets the stop through', async () => {
    // A stand-in for Claude Code: a shell whose command line names "claude" starts a fake listener, then the hook.
    const dir = tempDir('pia-hook-')
    const fake = join(dir, 'claude')
    writeFileSync(fake, [
      '#!/bin/sh',
      'node -e "setTimeout(() => {}, 15000)" listen.mjs pia 600 &',
      // The background listener starts a moment after the shell launches it: wait until it shows up, or a loaded machine
      // runs the hook first and the test sees no listener.
      'for i in $(seq 1 40); do pgrep -f "listen.mjs pia" >/dev/null && break; sleep 0.25; done',
      `sh '${HOOK}' stop '${CREW}' /srv/kit < /dev/null`,
      'wait'
    ].join('\n') + '\n')
    chmodSync(fake, 0o755)
    const run = spawnSync('sh', [fake], { encoding: 'utf8' })
    assert.equal(run.stdout, '', 'a listener under the session: the hook prints nothing, so the stop is allowed')
  })
})
