// `crew up pia`, `crew stop pia`, `crew restart pia` (pia-tmux.mjs, card mwmzv2jt). Most tests use fakes: no real claude, no real
// typing. The last test runs the tmux part on a real tmux with a throwaway socket, and its program is `cat`. Run:
//   node --test crew/pia-tmux.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { piaCommand, piaListenerLine, piaListenerInstruction, dialogTitle, startPia, stopPia, restartPia, realPiaDeps, piaTrust, piaAgentsOf, exitConfirmShowing, PIA_TMUX } from './pia-tmux.mjs'
import { pidFile } from './pidfile.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const ID = 'aa11bb22'
const NEW_ID = 'cc33dd44'
const FAST = { ready: 300, mail: 300, listener: 200, grace: 300, poll: 20 }
const hasTmux = spawnSync('tmux', ['-V']).status === 0

// A fake tmux: `alive` is whether the pia session exists, `screen` what it shows. Every call is logged.
function fakeTmux({ alive = false, screen = '', startEndsAt = null } = {}) {
  const t = { alive, screen, log: [], pasted: [] }
  t.tmux = {
    has: () => t.alive,
    start: (cwd, command) => {
      t.log.push(['start', cwd, command])
      t.alive = true
      if (startEndsAt === 'immediately') t.alive = false
    },
    paste: async text => {
      t.log.push(['paste', text])
      t.pasted.push(text)
    },
    screen: () => t.screen,
    key: name => {
      t.log.push(['key', name])
    },
    kill: () => {
      t.log.push(['kill'])
      t.alive = false
    }
  }
  return t
}

// The deps around a fake tmux. `agents` is what claude agents lists (ids that are live), `record` the recorded pia session.
// `listenerPid` is a listener already up; `listenerStarts` is the pid the listener the kit starts comes up with (null: it never comes up).
function fakeDeps({ tmux, agents = [], record = null, token = 'tok123', listenerPid = null, listenerStarts = null, stopOk = true, trust, hasCrewJson = true } = {}) {
  const log = []
  let listening = null
  const deps = {
    tmux: tmux.tmux,
    hasCrewJson: () => hasCrewJson,
    startListener: () => {
      log.push(['startListener'])
      listening = listenerStarts
    },
    folder: '/crew/pia-session',
    name: 'taskmanager-maintenance-pia',
    command: resume => `CMD resume=${resume || '-'}`,
    listAgents: () => agents,
    readRecord: () => record,
    recordId: id => log.push(['recordId', id]),
    stopClaude: id => {
      log.push(['stopClaude', id])
      return stopOk ? { ok: true } : { ok: false, reason: 'no such session' }
    },
    cleanSocket: () => log.push(['cleanSocket']),
    merge: () => log.push(['merge']),
    trust: trust ?? (() => ({ ok: true })),
    listenerUp: () => listening ?? listenerPid,
    killListener: pid => {
      log.push(['killListener', pid])
      listening = null
      listenerPid = null
    },
    sleep: async () => {},
    token: () => token
  }
  return { deps, log }
}

test('the command: model, dirs, merged settings, name, and --resume only with a valid id', () => {
  const cmd = piaCommand({ home: '/crew', kit: '/kit', claude: 'claude', name: 'taskmanager-maintenance-pia', resume: ID })
  assert.match(cmd, /^env CREW_HOME=\/crew /)
  assert.match(cmd, /--model claude-haiku-5-5/)
  assert.match(cmd, /--add-dir \/crew --add-dir \/kit/)
  assert.match(cmd, /--settings \/crew\/pia-session\/settings\.merged\.json/)
  assert.match(cmd, /-n taskmanager-maintenance-pia/)
  assert.match(cmd, new RegExp(`--resume ${ID}$`))
  const fresh = piaCommand({ home: '/crew', kit: '/kit', claude: 'claude', name: 'n', resume: '' })
  assert.doesNotMatch(fresh, /--resume/)
})

test('the command refuses an id that is not a session id (it is typed into a shell)', () => {
  assert.throws(() => piaCommand({ home: '/crew', kit: '/kit', claude: 'claude', name: 'n', resume: 'x; rm -rf /' }), /not a session id/)
})

test('up with no recorded id starts her fresh, says so, records the new id and checks mail and listener', async () => {
  const tmux = fakeTmux({ alive: false, screen: '' })
  const { deps, log } = fakeDeps({ tmux, agents: [{ id: NEW_ID, name: 'taskmanager-maintenance-pia', state: 'idle', status: 'running', startedAt: 5 }], record: null, token: 'tok123', listenerStarts: 4242 })
  // The fake shows the mail once it is pasted.
  tmux.tmux.paste = async text => { tmux.log.push(['paste', text]); tmux.screen = `${text}\n`; }
  const out = await startPia({ deps, timeouts: FAST })
  assert.equal(out.ok, true, out.lines.join('\n'))
  assert.ok(out.lines.some(l => /starting her fresh/.test(l)), out.lines.join('\n'))
  assert.ok(out.lines.some(l => /session cc33dd44 recorded/.test(l)), out.lines.join('\n'))
  assert.ok(out.lines.some(l => /test mail tok123 pasted and on her screen/.test(l)), out.lines.join('\n'))
  assert.ok(out.lines.some(l => /board listener started \(pid 4242\)/.test(l)), out.lines.join('\n'))
  assert.deepEqual(log.find(e => e[0] === 'recordId'), ['recordId', NEW_ID])
  assert.equal(tmux.log.find(e => e[0] === 'start')[2], 'CMD resume=-')
})

test('up with a recorded id resumes that id and records nothing new', async () => {
  const tmux = fakeTmux({ alive: false })
  tmux.tmux.paste = async text => { tmux.log.push(['paste', text]); tmux.screen = text }
  const { deps, log } = fakeDeps({ tmux, agents: [{ id: ID, name: 'x', state: 'idle', status: 'running', startedAt: 1 }], record: { id: ID }, token: 'tok9', listenerPid: 7 })
  const out = await startPia({ deps, timeouts: FAST })
  assert.equal(out.ok, true, out.lines.join('\n'))
  assert.equal(tmux.log.find(e => e[0] === 'start')[2], `CMD resume=${ID}`)
  assert.equal(log.some(e => e[0] === 'recordId'), false)
  assert.ok(out.lines.some(l => new RegExp(`session ${ID} live`).test(l)), out.lines.join('\n'))
})

test('a resume that claude refuses is reported as failed, never followed by a fresh start', async () => {
  const tmux = fakeTmux({ alive: false, startEndsAt: 'immediately' })
  const { deps, log } = fakeDeps({ tmux, agents: [], record: { id: ID } })
  const out = await startPia({ deps, timeouts: FAST })
  assert.equal(out.ok, false)
  assert.ok(out.lines.some(l => new RegExp(`resume of ${ID} failed`).test(l) && /not started fresh/.test(l)), out.lines.join('\n'))
  assert.equal(log.some(e => e[0] === 'recordId'), false)
  assert.equal(tmux.pasted.length, 0)
})

test('up when her session is already running does nothing', async () => {
  const tmux = fakeTmux({ alive: true })
  const { deps } = fakeDeps({ tmux, record: { id: ID } })
  const out = await startPia({ deps, timeouts: FAST })
  assert.equal(out.ok, true)
  assert.deepEqual(out.lines, ['pia: already running'])
  assert.equal(tmux.log.some(e => e[0] === 'start'), false)
})

test('a dialog on her screen is reported, and nothing is pasted into it', async () => {
  const dialog = '? Teach auto mode about your environment?\n  Enter to continue\n  Esc to cancel'
  const tmux = fakeTmux({ alive: false, screen: dialog })
  const { deps } = fakeDeps({ tmux, agents: [{ id: ID, name: 'x', state: 'idle', status: 'running', startedAt: 1 }], record: { id: ID } })
  const out = await startPia({ deps, timeouts: FAST })
  assert.equal(out.ok, false)
  assert.ok(out.lines.some(l => /dialog is showing \("\? Teach auto mode about your environment\?"\)/.test(l)), out.lines.join('\n'))
  assert.equal(tmux.pasted.length, 0)
})

test('a test mail that never shows on her screen fails the start', async () => {
  const tmux = fakeTmux({ alive: false, screen: '' })
  const { deps } = fakeDeps({ tmux, agents: [{ id: ID, name: 'x', state: 'idle', status: 'running', startedAt: 1 }], record: { id: ID }, token: 'lost9' })
  const out = await startPia({ deps, timeouts: FAST })
  assert.equal(out.ok, false)
  assert.ok(out.lines.some(l => /test mail lost9 not seen on her screen/.test(l)), out.lines.join('\n'))
})

// Boss (2026-11-19, Pat's FAIL at 4291ec9): the kit starts Pia's board listener after the mail check and reports its pid. A listener
// that does not come up is a FAIL line, never a hint.
test('the start starts her board listener after the mail check, and reports its pid', async () => {
  const tmux = fakeTmux({ alive: false })
  tmux.tmux.paste = async text => { tmux.log.push(['paste', text]); tmux.screen = text }
  const { deps, log } = fakeDeps({ tmux, agents: [{ id: ID, name: 'x', state: 'idle', status: 'running', startedAt: 1 }], record: { id: ID }, token: 'tok6', listenerStarts: 5150 })
  const out = await startPia({ deps, timeouts: FAST })
  assert.equal(out.ok, true, out.lines.join('\n'))
  assert.ok(log.some(e => e[0] === 'startListener'), 'the kit starts the listener itself')
  assert.ok(out.lines.some(l => /board listener started \(pid 5150\)/.test(l)), out.lines.join('\n'))
  const mailAt = out.lines.findIndex(l => /test mail tok6 pasted/.test(l))
  const listenerAt = out.lines.findIndex(l => /board listener started/.test(l))
  assert.ok(mailAt >= 0 && listenerAt > mailAt, 'the listener comes after the mail check')
})

test('a listener that does not come up is a FAIL line and the start fails', async () => {
  const tmux = fakeTmux({ alive: false })
  tmux.tmux.paste = async text => { tmux.log.push(['paste', text]); tmux.screen = text }
  const { deps } = fakeDeps({ tmux, agents: [{ id: ID, name: 'x', state: 'idle', status: 'running', startedAt: 1 }], record: { id: ID }, token: 'tok5', listenerStarts: null })
  const out = await startPia({ deps, timeouts: FAST })
  assert.equal(out.ok, false)
  assert.ok(out.lines.some(l => /^pia: FAIL: board listener did not come up after/.test(l)), out.lines.join('\n'))
})

test('a listener that is already up is reported with its pid, and no second one is started', async () => {
  const tmux = fakeTmux({ alive: false })
  tmux.tmux.paste = async text => { tmux.log.push(['paste', text]); tmux.screen = text }
  const { deps, log } = fakeDeps({ tmux, agents: [{ id: ID, name: 'x', state: 'idle', status: 'running', startedAt: 1 }], record: { id: ID }, token: 'tok7', listenerPid: 77 })
  const out = await startPia({ deps, timeouts: FAST })
  assert.equal(out.ok, true, out.lines.join('\n'))
  assert.equal(log.some(e => e[0] === 'startListener'), false)
  assert.ok(out.lines.some(l => /board listener already up \(pid 77\)/.test(l)), out.lines.join('\n'))
})

// The command the kit starts is the one Pia's SessionStart hook prints (pia-listener-hook.sh), for the same crew home and kit.
test('the listener command is the one her hook runs', () => {
  const home = '/crew/home'
  const kit = here
  const hook = spawnSync('sh', [join(here, 'pia-listener-hook.sh'), 'sessionstart', home, kit], { encoding: 'utf8' })
  assert.match(hook.stdout, /"additionalContext":"First thing/)
  assert.ok(hook.stdout.includes(piaListenerLine({ home, kit })), hook.stdout)
})

test('an untrusted folder stops the start before tmux is touched', async () => {
  const tmux = fakeTmux({ alive: false })
  const { deps } = fakeDeps({ tmux, record: { id: ID }, trust: () => ({ ok: false, reason: 'the folder /crew/pia-session is not trusted by claude' }) })
  const out = await startPia({ deps, timeouts: FAST })
  assert.equal(out.ok, false)
  assert.ok(out.lines.some(l => /not trusted by claude/.test(l)), out.lines.join('\n'))
  assert.equal(tmux.log.some(e => e[0] === 'start'), false)
})

test('stop when she is not running says so', async () => {
  const tmux = fakeTmux({ alive: false })
  const { deps } = fakeDeps({ tmux })
  const out = await stopPia({ deps, timeouts: FAST })
  assert.equal(out.ok, true)
  assert.deepEqual(out.lines, ['pia: not running'])
})

test('stop sends /exit and the session ends: no kill', async () => {
  const tmux = fakeTmux({ alive: true, screen: '> ' })
  tmux.tmux.paste = async text => {
    tmux.log.push(['paste', text])
    tmux.pasted.push(text)
    tmux.alive = false
  }
  const { deps, log } = fakeDeps({ tmux, record: { id: ID } })
  const out = await stopPia({ deps, timeouts: FAST })
  assert.equal(out.ok, true)
  assert.deepEqual(tmux.pasted, ['/exit'])
  assert.ok(out.lines.some(l => /stopped: her session ended on \/exit/.test(l)), out.lines.join('\n'))
  assert.equal(tmux.log.some(e => e[0] === 'kill'), false)
  assert.equal(log.some(e => e[0] === 'stopClaude'), false)
})

test('stop when /exit does not end her session kills it, names her last screen line, and runs claude stop while she is still listed', async () => {
  const tmux = fakeTmux({ alive: true, screen: 'a reply\n> ' })
  const still = [{ id: ID, name: 'x', state: 'busy', status: 'busy', startedAt: 1 }]
  const { deps, log } = fakeDeps({ tmux, record: { id: ID }, agents: still })
  const out = await stopPia({ deps, timeouts: FAST })
  assert.equal(out.ok, true)
  assert.ok(out.lines.some(l => /did not end her session/.test(l) && /screen ends: ">"/.test(l)), out.lines.join('\n'))
  assert.ok(out.lines.some(l => /tmux session killed/.test(l)), out.lines.join('\n'))
  assert.ok(log.some(e => e[0] === 'stopClaude' && e[1] === ID))
  assert.equal(tmux.alive, false)
})

// `claude stop` has no session to stop for an interactive one that the kill already ended (it answers "No session matching").
test('after the kill, claude stop is not run when she is no longer listed', async () => {
  const tmux = fakeTmux({ alive: true, screen: '> ' })
  const { deps, log } = fakeDeps({ tmux, record: { id: ID }, agents: [] })
  const out = await stopPia({ deps, timeouts: FAST })
  assert.equal(out.ok, true)
  assert.equal(log.some(e => e[0] === 'stopClaude'), false)
  assert.ok(out.lines.some(l => /not listed after the kill/.test(l)), out.lines.join('\n'))
})

test('stop with a dialog up does not answer it: it kills the session and says why', async () => {
  const dialog = '? Teach auto mode about your environment?\n  Enter to continue\n  Esc to cancel'
  const tmux = fakeTmux({ alive: true, screen: dialog })
  const { deps } = fakeDeps({ tmux, record: null })
  const out = await stopPia({ deps, timeouts: FAST })
  assert.equal(out.ok, true)
  assert.equal(tmux.pasted.length, 0)
  assert.ok(out.lines.some(l => /dialog is showing/.test(l)), out.lines.join('\n'))
  assert.equal(tmux.alive, false)
})

test('restart stops her, then starts her again, each step on its own line', async () => {
  const tmux = fakeTmux({ alive: false, screen: '' })
  tmux.tmux.paste = async text => { tmux.log.push(['paste', text]); tmux.screen = text }
  const { deps } = fakeDeps({ tmux, agents: [{ id: ID, name: 'x', state: 'idle', status: 'running', startedAt: 1 }], record: { id: ID }, token: 'tok8', listenerPid: 9, listenerStarts: 10 })
  const out = await restartPia({ deps, timeouts: FAST })
  assert.equal(out.ok, true, out.lines.join('\n'))
  assert.equal(out.lines[0], 'pia: not running')
  // stop ends the old listener (9); the start brings up the new one (10).
  assert.ok(out.lines.some(l => /board listener stopped \(pid 9\)/.test(l)), out.lines.join('\n'))
  assert.ok(out.lines.some(l => /board listener started \(pid 10\)/.test(l)), out.lines.join('\n'))
  assert.ok(out.lines.some(l => /session aa11bb22 live/.test(l)), out.lines.join('\n'))
})

test('the real tmux part: start, paste a mail that shows, stop; on a throwaway socket', { skip: !hasTmux }, async () => {
  const home = mkdtempSync(join(process.env.TMPDIR || '/tmp', 'pia-tmux-home-'))
  mkdirSync(join(home, 'sessions'), { recursive: true })
  writeFileSync(join(home, 'crew.json'), '{"team":"throwaway"}\n')
  writeFileSync(join(home, 'sessions', 'pia.json'), JSON.stringify({ id: ID, name: 'pia' }))
  // The fake claude: `agents --json` lists the recorded id as live; anything else echoes its input.
  const fake = join(home, 'fake-claude.sh')
  writeFileSync(fake, `#!/bin/sh\nif [ "$1" = agents ]; then echo '[{"id":"${ID}","name":"taskmanager-maintenance-pia","state":"idle","status":"running","startedAt":1}]'; exit 0; fi\nexec cat\n`, { mode: 0o755 })
  const deps = realPiaDeps(home, here, { bin: fake, trust: () => ({ ok: true }), name: 'taskmanager-maintenance-pia' })
  // A stand-in for listen.mjs: its command line names `listen.mjs pia` and it writes its pid where listen.mjs does. Never the real one.
  const standIn = join(home, 'listen.mjs')
  writeFileSync(standIn, '#!/bin/sh\nmkdir -p "$CREW_HOME/.listen"\necho $$ > "$CREW_HOME/.listen/pia.pid"\nsleep 120\n')
  deps.startListener = () => spawn('sh', [standIn, 'pia', '3600'], { env: { ...process.env, CREW_HOME: home }, detached: true, stdio: 'ignore' }).unref()
  try {
    const up = await startPia({ deps, timeouts: { ready: 5000, mail: 8000, listener: 3000, grace: 500, poll: 100 } })
    assert.equal(up.ok, true, up.lines.join('\n'))
    assert.ok(up.lines.some(l => /board listener started \(pid \d+\)/.test(l)), up.lines.join('\n'))
    assert.ok(up.lines.some(l => /test mail .* pasted and on her screen/.test(l)), up.lines.join('\n'))
    assert.equal(existsSync(join(home, 'pia-session', 'settings.merged.json')), true)
    const down = await stopPia({ deps, timeouts: { ready: 5000, mail: 8000, listener: 300, grace: 500, poll: 100 } })
    assert.equal(down.ok, true, down.lines.join('\n'))
    assert.equal(deps.tmux.has(), false)
    assert.match(readFileSync(join(home, 'sessions', 'pia.json'), 'utf8'), new RegExp(ID))
  } finally {
    spawnSync('tmux', ['-S', join(home, 'tmux.sock'), 'kill-server'])
    try {
      process.kill(Number(readFileSync(join(home, '.listen', 'pia.pid'), 'utf8')), 'SIGTERM')
    } catch {}
  }
})

// Quincy's V1 (2026-11-19): the two --add-dir folders are in her merged settings as permissions.additionalDirectories, so claude
// does not ask "Adding a new directory" on the first start.
test('the merged settings allow the two --add-dir folders (crew home and kit) as additionalDirectories', () => {
  const home = mkdtempSync(join(tmpdir(), 'pia-adddir-home-'))
  const deps = realPiaDeps(home, here, { bin: 'claude', trust: () => ({ ok: true }) })
  deps.merge()
  const merged = JSON.parse(readFileSync(join(home, 'pia-session', 'settings.merged.json'), 'utf8'))
  assert.deepEqual(merged.permissions.additionalDirectories, [home, here])
  assert.equal(merged.remoteControlAtStartup, false)
})

// Her merged settings are written with this home's and this kit's hook commands: the static pia-session.settings.json has none of
// the arguments the listener hook needs (crew home and kit), so her listener start line came out empty.
test('Pia\'s merged settings carry the hook commands for this crew home and kit', () => {
  const home = mkdtempSync(join(tmpdir(), 'pia-hooks-home-'))
  const deps = realPiaDeps(home, here, { bin: 'claude', trust: () => ({ ok: true }) })
  deps.merge()
  const merged = JSON.parse(readFileSync(join(home, 'pia-session', 'settings.merged.json'), 'utf8'))
  assert.equal(merged.remoteControlAtStartup, false)
  const stop = merged.hooks.Stop[0].hooks[0].command
  const start = merged.hooks.SessionStart[0].hooks[0].command
  assert.match(stop, /pia-listener-hook\.sh' stop|pia-listener-hook\.sh stop/)
  assert.ok(stop.includes(home) && stop.includes(here), stop)
  assert.ok(start.includes('sessionstart') && start.includes(home), start)
})

// `claude agents --json` lists background sessions with `id` and interactive ones (Pia's, in her tmux session) with `sessionId`
// and no `id`. Both are her session's id when she is live; session.mjs parseAgents drops the interactive ones, so Pia reads her own.
test('Pia reads an interactive session by its sessionId, and a background one by its id', () => {
  const json = JSON.stringify([
    { pid: 1, sessionId: `${ID}-0000-4000-8000-000000000001`, name: 'qa-wade-pia', kind: 'interactive', status: 'busy', startedAt: 5 },
    { pid: 2, id: 'ee55ff66', name: 'usher', kind: 'background', state: 'blocked', status: 'idle', startedAt: 3 }
  ])
  const list = piaAgentsOf(json)
  assert.deepEqual(list.map(a => a.id), [`${ID}-0000-4000-8000-000000000001`, 'ee55ff66'])
  assert.equal(list[0].name, 'qa-wade-pia')
  assert.equal(list[0].startedAt, 5)
  assert.equal(piaAgentsOf('not json'), null)
})

// Pia's folder is pia-session inside the crew home: trusted in Claude's config with the crew's own paths, and nothing else is.
test('Pia\'s folder is trusted in Claude\'s config, and no other folder is', () => {
  const home = mkdtempSync(join(tmpdir(), 'pia-trust-home-'))
  const file = join(mkdtempSync(join(tmpdir(), 'pia-trust-cfg-')), '.claude.json')
  writeFileSync(file, '{}\n')
  const folder = join(home, 'pia-session')
  const out = piaTrust({ home, kit: here, folder, file })
  assert.equal(out.ok, true, out.reason)
  const data = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(data.projects[folder].hasTrustDialogAccepted, true)
  assert.equal(data.projects[home].hasTrustDialogAccepted, true)
  const other = piaTrust({ home, kit: here, folder: '/tmp/somewhere-else', file })
  assert.equal(other.ok, false)
  assert.match(other.reason, /not the crew home's pia-session folder/)
})

// The /exit confirm (Boss, 2026-11-19): after /exit with a background shell running, Claude shows "Enter to confirm · Esc to
// cancel". The kit presses Enter once for that dialog only. The question line above the footer is the background-shell wording;
// it is matched on "background" (assumed wording: check it against a real screen when one is next seen).
const EXIT_CONFIRM = ['1 background shell is still running', 'Exit anyway?', '  Enter to confirm · Esc to cancel']
const OTHER_CONFIRM = ['Teach auto mode about your environment?', '  Enter to confirm · Esc to cancel']
const CONTINUE_DIALOG = ['? Teach auto mode about your environment?', '  Enter to continue']

test('exitConfirmShowing matches only the background-shell exit confirm', () => {
  assert.equal(exitConfirmShowing(EXIT_CONFIRM.join('\n')), true)
  assert.equal(exitConfirmShowing(OTHER_CONFIRM.join('\n')), false)
  assert.equal(exitConfirmShowing(CONTINUE_DIALOG.join('\n')), false)
  assert.equal(exitConfirmShowing('> '), false)
  assert.equal(exitConfirmShowing(''), false)
})

// A tmux whose /exit shows `screenAfterExit`, and whose Enter ends the session when `endsOnKey` is set.
function exitConfirmTmux(screenAfterExit, { endsOnKey = false } = {}) {
  const tmux = fakeTmux({ alive: true, screen: '> ' })
  tmux.tmux.paste = async text => {
    tmux.log.push(['paste', text])
    tmux.pasted.push(text)
    tmux.screen = screenAfterExit
  }
  tmux.tmux.key = name => {
    tmux.log.push(['key', name])
    if (endsOnKey) tmux.alive = false
  }
  return tmux
}

test('stop presses Enter once on the background-shell exit confirm, and her session ends: no kill', async () => {
  const tmux = exitConfirmTmux(EXIT_CONFIRM.join('\n'), { endsOnKey: true })
  const { deps } = fakeDeps({ tmux, record: null })
  const out = await stopPia({ deps, timeouts: FAST })
  assert.equal(out.ok, true)
  assert.deepEqual(tmux.log.filter(e => e[0] === 'key'), [['key', 'Enter']])
  assert.equal(tmux.log.some(e => e[0] === 'kill'), false)
  assert.ok(out.lines.some(l => /exit confirm answered \(Enter, once\)/.test(l)), out.lines.join('\n'))
})

test('stop presses Enter only once even when the confirm stays up, and then kills after the grace time', async () => {
  const tmux = exitConfirmTmux(EXIT_CONFIRM.join('\n'), { endsOnKey: false })
  const { deps } = fakeDeps({ tmux, record: null })
  const out = await stopPia({ deps, timeouts: FAST })
  assert.equal(out.ok, true)
  assert.equal(tmux.log.filter(e => e[0] === 'key').length, 1)
  assert.ok(out.lines.some(l => /did not end her session/.test(l)), out.lines.join('\n'))
  assert.equal(tmux.alive, false)
})

test('stop never answers any other dialog after /exit: it kills after the grace time', async () => {
  for (const screen of [CONTINUE_DIALOG, OTHER_CONFIRM]) {
    const tmux = exitConfirmTmux(screen.join('\n'), { endsOnKey: true })
    const { deps } = fakeDeps({ tmux, record: null })
    const out = await stopPia({ deps, timeouts: FAST })
    assert.equal(tmux.log.some(e => e[0] === 'key'), false, screen[0])
    assert.ok(out.lines.some(l => /did not end her session/.test(l)), out.lines.join('\n'))
    assert.equal(tmux.alive, false)
  }
})

// A home with no crew.json is not a crew home: a Pia start there would start a listener that reads the wrong crew (card mwmzv2jt,
// Boss 2026-11-19). The start refuses before anything runs.
test('a start with no crew.json refuses, and nothing runs: no tmux, no claude, no listener', async () => {
  const tmux = fakeTmux({ alive: false })
  const { deps, log } = fakeDeps({ tmux, hasCrewJson: false, record: { id: ID } })
  const out = await startPia({ deps, timeouts: FAST })
  assert.equal(out.ok, false)
  assert.ok(out.lines.some(l => /no crew\.json/.test(l) && /not started/.test(l)), out.lines.join('\n'))
  assert.equal(tmux.log.length, 0)
  assert.equal(log.length, 0)
})

test('the real start refuses a home with no crew.json before claude is run', async () => {
  const home = mkdtempSync(join(tmpdir(), 'pia-nocrew-home-'))
  const marker = join(home, 'claude-was-run')
  const bin = join(home, 'fake-claude.sh')
  writeFileSync(bin, `#!/bin/sh\ntouch ${marker}\n`, { mode: 0o755 })
  const deps = realPiaDeps(home, here, { bin, trust: () => ({ ok: true }) })
  const out = await startPia({ deps, timeouts: FAST })
  assert.equal(out.ok, false)
  assert.ok(out.lines.some(l => /no crew\.json/.test(l)), out.lines.join('\n'))
  assert.equal(existsSync(marker), false)
  assert.equal(existsSync(join(home, 'tmux.sock')), false)
  assert.equal(existsSync(join(home, '.listen')), false)
})

// Quincy's V1 (2026-11-19): the first real start stops at claude's "Adding a new directory" dialog (--add-dir). The kit names any
// dialog on its output by its title line and refuses; it never answers one, and stop never pastes /exit into one.
// The add-dir dialog as Quincy saw it (75ea1ab): a separator line, the title "Adding a new directory: <folder>", the dialog's own text
// (with a "Security guide" link row under the title), the options, and the footer.
const SEPARATOR_ROW = '────────────────────────────────────────────────────────────'
const ADD_DIR = [
  SEPARATOR_ROW,
  'Adding a new directory: /srv/agents/taskmanager-maintenance/.config/taskmanager-crew',
  "Claude Code'll be able to read files in this directory.",
  'Security guide: https://code.claude.com/docs/en/security',
  '',
  '❯ 1. No, exit',
  '  2. Yes, add it',
  '',
  'Enter to confirm · Esc to cancel'
]

test('dialogTitle takes the title from the block above the first option row: "Adding a new directory:" on the real screen', () => {
  assert.equal(dialogTitle(ADD_DIR.join('\n')), 'Adding a new directory:')
  // Transcript rows above the separator are not the title, and neither is the "Security guide" row under it.
  assert.equal(dialogTitle(['Claude Code will read the transcript above.', SEPARATOR_ROW, 'Adding a new directory: /x', 'Security guide: https://x', '❯ 1. No, exit', 'Enter to confirm · Esc to cancel'].join('\n')), 'Adding a new directory:')
})

test('dialogTitle names a dialog by its title line, and is null when no dialog is up', () => {
  assert.equal(dialogTitle(['? Teach auto mode about your environment?', '  Enter to continue'].join('\n')), '? Teach auto mode about your environment?')
  assert.equal(dialogTitle('> '), null)
  assert.equal(dialogTitle('some transcript\n> '), null)
})

test('a start on the add-dir dialog is refused and named, with no key and no paste', async () => {
  const tmux = fakeTmux({ alive: false, screen: ADD_DIR.join('\n') })
  const { deps } = fakeDeps({ tmux, agents: [], record: { id: ID } })
  const out = await startPia({ deps, timeouts: FAST })
  assert.equal(out.ok, false)
  assert.ok(out.lines.some(l => /dialog is showing \("Adding a new directory:"\); not answered; not started/.test(l)), out.lines.join('\n'))
  assert.equal(tmux.log.some(e => e[0] === 'key'), false)
  assert.equal(tmux.pasted.length, 0)
})

test('stop on the add-dir dialog does not paste /exit into it: it kills and names it', async () => {
  const tmux = fakeTmux({ alive: true, screen: ADD_DIR.join('\n') })
  const { deps } = fakeDeps({ tmux, record: null })
  const out = await stopPia({ deps, timeouts: FAST })
  assert.equal(out.ok, true)
  assert.equal(tmux.pasted.length, 0)
  assert.equal(tmux.log.some(e => e[0] === 'key'), false)
  assert.ok(out.lines.some(l => /dialog is showing \("Adding a new directory:"\)/.test(l)), out.lines.join('\n'))
  assert.equal(tmux.alive, false)
})

test('the trust step covers the --add-dir folders it passes: the crew home and the kit, and Pia\'s folder', () => {
  const home = mkdtempSync(join(tmpdir(), 'pia-trust2-home-'))
  const file = join(mkdtempSync(join(tmpdir(), 'pia-trust2-cfg-')), '.claude.json')
  writeFileSync(file, '{}\n')
  const folder = join(home, 'pia-session')
  assert.equal(piaTrust({ home, kit: here, folder, file }).ok, true)
  const data = JSON.parse(readFileSync(file, 'utf8'))
  for (const p of [home, here, folder]) assert.equal(data.projects[p].hasTrustDialogAccepted, true, p)
})

// Quincy's V4 (2026-11-19): the listener must be the one her Stop hook recognises. The hook counts a listener that is a
// descendant of her own claude process, and that is only true when she starts it as her background command. So the kit has
// her start it with the hook's command and waits for its pid.
test('the kit has Pia start her listener as her own background command, with the command her hook gives her', () => {
  const home = '/crew/home'
  const text = piaListenerInstruction({ home, kit: here })
  assert.ok(text.includes(piaListenerLine({ home, kit: here })), text)
  assert.match(text, /run_in_background: true/)
  assert.match(text, /never nohup/)
})

test('the real deps paste that instruction into her terminal, and the hook reads the pid file the listener writes', async () => {
  const home = mkdtempSync(join(tmpdir(), 'pia-instr-home-'))
  writeFileSync(join(home, 'crew.json'), '{"team":"throwaway"}\n')
  const log = join(home, 'tmux-calls.log')
  const fakeTmuxBin = join(home, 'fake-tmux.sh')
  writeFileSync(fakeTmuxBin, `#!/bin/sh\necho "$*" >> "${log}"\ncase "$3" in load-buffer) cat >> "${log}.stdin";; esac\nexit 0\n`, { mode: 0o755 })
  const deps = realPiaDeps(home, here, { bin: 'claude', tmuxBin: fakeTmuxBin, trust: () => ({ ok: true }) })
  await deps.startListener()
  const stdin = readFileSync(`${log}.stdin`, 'utf8')
  assert.ok(stdin.includes(piaListenerLine({ home, kit: here })), stdin)
  assert.match(stdin, /run_in_background: true/)
  // The pid file the hook reads (pia-listener-hook.sh: $CREW/.listen/pia.pid) is the one listen.mjs writes (pidfile.mjs).
  assert.equal(pidFile(home, 'pia'), join(home, '.listen', 'pia.pid'))
  const hook = readFileSync(join(here, 'pia-listener-hook.sh'), 'utf8')
  assert.ok(hook.includes('$CREW/.listen/pia.pid'))
  assert.ok(hook.includes('listen.mjs pia'))
})

// Quincy's V5 (2026-11-19): stop ends Pia's listener too, so a restart does not find the old one still up.
test('stop ends her board listener when it is up, after her session is killed', async () => {
  const tmux = fakeTmux({ alive: true, screen: '> ' })
  const { deps, log } = fakeDeps({ tmux, record: null, listenerPid: 77 })
  const out = await stopPia({ deps, timeouts: FAST })
  assert.equal(out.ok, true)
  assert.deepEqual(log.filter(e => e[0] === 'killListener'), [['killListener', 77]])
  assert.ok(out.lines.some(l => /board listener stopped \(pid 77\)/.test(l)), out.lines.join('\n'))
})

test('stop with her session already gone still ends a listener that is up', async () => {
  const tmux = fakeTmux({ alive: false })
  const { deps, log } = fakeDeps({ tmux, record: null, listenerPid: 78 })
  const out = await stopPia({ deps, timeouts: FAST })
  assert.equal(out.ok, true)
  assert.deepEqual(log.filter(e => e[0] === 'killListener'), [['killListener', 78]])
})

test('the tmux session name is pia', () => {
  assert.equal(PIA_TMUX, 'pia')
})
