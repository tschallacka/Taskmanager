// Pia's own terminal (card mwmzv2jt, Boss ruling 2026-11-19). Her Claude Code session runs in the tmux session `pia` on the
// crew's tmux socket (CREW_HOME/tmux.sock), the way Susy's daemon runs. `crew up pia`, `crew stop pia` and `crew restart pia`
// come through here (people-control.mjs). The adapter that the mailbox daemon types into is pia-term.sh.
//
//   up       not running: her session is started with --resume <her recorded id>; with no recorded id she starts fresh and
//            that is said. A refused resume is reported and never followed by a fresh start. Then: her screen is checked for
//            a dialog (never answered), the test mail is pasted and must show on her screen, and her board listener is checked.
//   stop     /exit is sent and her session must end; when it does not end in the grace time, the tmux session is killed. A
//            dialog on her screen is not answered: the session is killed and the dialog is named. Then `claude stop <id>`.
//   restart  stop, then up.
//
// The deps are injected (startPia, stopPia): fakes in pia-tmux.test.mjs, realPiaDeps in production.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { livePid } from './pidfile.mjs'
import { shellWord } from './home.mjs'
import { MODEL, readRecord, runClaude, sessionName, validSessionId, writeRecord, crewSlug } from './session.mjs'
import { configFile, crewOwnPaths, ensureTrusted, readWorktreeBase, recordedFolders } from './claude-trust.mjs'
import { piaHooks } from './pia-session.mjs'

export const PIA_KEY = 'pia'
export const PIA_TMUX = 'pia'
export const TIMEOUTS = { ready: 60000, mail: 30000, listener: 120000, grace: 20000, poll: 500 }
const LISTENER_MATCH = 'listen.mjs pia'
const GONE = 'gone'
const DIALOG = 'dialog'

/**
 * The sessions of `claude agents --json` as Pia reads them: { id, name, state, status, startedAt }. A background session's id is
 * `id`; an interactive one (Pia's own, in tmux) has `sessionId` and no `id`. Null when the output is not a list.
 */
export function piaAgentsOf(json) {
  let list
  try {
    list = JSON.parse(json)
  } catch {
    return null
  }
  if (!Array.isArray(list)) return null
  return list
    .map(a => ({ a, id: a?.id ?? a?.sessionId }))
    .filter(({ id }) => validSessionId(id))
    .map(({ a, id }) => ({ id, name: a.name ?? '', state: a.state ?? '', status: a.status ?? '', startedAt: Number(a.startedAt) || 0 }))
}

/**
 * Trust for Pia's folder: `pia-session` directly inside the crew home. claude-trust's crew folders are the home, the kit and the
 * worker folders, so Pia's folder is trusted here with the crew's own paths and nothing else. Returns { ok, changed } or { ok, reason }.
 */
export function piaTrust({ home: homeIn, kit: kitIn, folder, file = configFile(), worktreeBase }) {
  const home = resolve(homeIn)
  const kit = resolve(kitIn)
  worktreeBase ??= readWorktreeBase(home)
  if (dirname(folder) !== home || !folder.endsWith('pia-session')) return { ok: false, reason: `${folder} is not the crew home's pia-session folder; not trusted` }
  const { trust } = crewOwnPaths({ home, kit, worktreeBase, folders: recordedFolders(home) })
  const res = ensureTrusted([...trust, folder], { file })
  return res.ok ? { ok: true, changed: res.changed } : { ok: false, reason: res.reason }
}

/**
 * The listener command for Pia, in the form her SessionStart hook prints (pia-listener-hook.sh): her crew home, the kit's
 * listen.mjs, the name pia, one hour. The kit starts her listener with it; her hook would start the same one.
 */
export function piaListenerLine({ home, kit }) {
  return `CREW_HOME='${home}' node '${kit}/listen.mjs' pia 3600`
}

/**
 * What the kit types into Pia's terminal to start her listener: the hook's own instruction, with the hook's command. Run by her
 * Bash tool, the listener is her background command, so her Stop hook counts it and its exit wakes her.
 */
export function piaListenerInstruction({ home, kit }) {
  return `Start your board listener now: run this with your Bash tool, run_in_background: true (never nohup): ${piaListenerLine({ home, kit })} . Then carry on; its exit wakes you.`
}

// The title line of a dialog on Pia's screen (Boss, 2026-11-19): the block above the first option row, from the separator line above
// it (or the rows above, when there is none) down to the option. Its first non-empty row is the title; a colon ends it, so
// "Adding a new directory: <folder>" reads "Adding a new directory:". Null when no dialog shows.
const DIALOG_FOOTER = /enter to (confirm|continue)|esc to cancel/i
const OPTION_ROW = /^(❯|>|\d+\.)/
const SEPARATOR_ROW = /^[─━]{8,}$/
export function dialogTitle(screen) {
  const rows = String(screen ?? '').split('\n').map(r => r.trim())
  let footer = -1
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (DIALOG_FOOTER.test(rows[i])) {
      footer = i
      break
    }
  }
  if (footer < 0) return null
  const firstOption = rows.findIndex(r => OPTION_ROW.test(r))
  const option = firstOption >= 0 && firstOption < footer ? firstOption : footer
  let start = Math.max(0, option - 12)
  for (let i = option - 1; i >= start; i -= 1) {
    if (SEPARATOR_ROW.test(rows[i])) {
      start = i + 1
      break
    }
  }
  const title = rows.slice(start, option).find(r => r && !SEPARATOR_ROW.test(r)) ?? rows[footer]
  const colon = title.indexOf(':')
  return colon > 0 ? title.slice(0, colon + 1) : title
}

/** The shell line that starts Pia's claude in her tmux session. The flags are the ones PROMPTS.md "Starting Pia" gives. */
export function piaCommand({ home: homeIn, kit: kitIn, claude = 'claude', name, resume = '' }) {
  if (resume && !validSessionId(resume)) throw new Error(`not a session id: ${resume}`)
  const home = resolve(homeIn)
  const kit = resolve(kitIn)
  const settings = join(home, 'pia-session', 'settings.merged.json')
  const args = [claude, '--model', MODEL, '--add-dir', home, '--add-dir', kit, '--settings', settings, '-n', name, ...(resume ? ['--resume', resume] : [])]
  return `env CREW_HOME=${shellWord(home)} ${args.map(shellWord).join(' ')}`
}

// Polls check() until it returns something true. Returns that value, or null after ms.
async function waitFor(check, { ms, poll, sleep }) {
  const tries = Math.max(1, Math.ceil(ms / poll))
  for (let i = 0; i < tries; i += 1) {
    const value = check()
    if (value) return value
    await sleep(poll)
  }
  return null
}

const withDefaults = timeouts => ({ ...TIMEOUTS, ...timeouts })
const live = a => a.state !== 'ended' && a.status !== 'stopped'

/** `up`: her session started, checked and reported. `deps` is what realPiaDeps returns (see the header). */
export async function startPia({ deps, timeouts }) {
  const t = withDefaults(timeouts)
  const clock = { sleep: deps.sleep, poll: t.poll }
  // A home with no crew.json is not a crew home: refused before anything runs, so no listener starts against the wrong crew.
  if (!deps.hasCrewJson()) return { ok: false, lines: ['pia: the crew home has no crew.json, so it is not a crew home: she is not started and no listener is started'] }
  if (deps.tmux.has()) return { ok: true, lines: ['pia: already running'] }
  deps.cleanSocket()
  const record = deps.readRecord()
  const resume = validSessionId(record?.id) ? record.id : ''
  const lines = [resume ? `pia: resuming ${resume}` : 'pia: no recorded session id: starting her fresh (the first start of her session, said on the card)']
  const trusted = deps.trust()
  if (!trusted.ok) return { ok: false, lines: [...lines, `pia: ${trusted.reason}; not started`] }
  deps.merge()
  deps.tmux.start(deps.folder, deps.command(resume))

  // A dialog on her screen during the start (the --add-dir one, a trust one) refuses the start and is named; it is never answered.
  const found = await waitFor(() => {
    if (!deps.tmux.has()) return GONE
    if (dialogTitle(deps.tmux.screen())) return DIALOG
    const list = deps.listAgents() ?? []
    if (resume) return list.find(a => a.id === resume && live(a)) ?? null
    return list.filter(a => a.name === deps.name && live(a)).sort((a, b) => b.startedAt - a.startedAt)[0] ?? null
  }, { ms: t.ready, ...clock })
  if (found === GONE) {
    const why = resume ? `resume of ${resume} failed: her session ended on start; the id stays recorded; not started fresh` : 'her session ended on start'
    return { ok: false, lines: [...lines, `pia: ${why}`] }
  }
  if (found === DIALOG) return { ok: false, lines: [...lines, `pia: a dialog is showing ("${dialogTitle(deps.tmux.screen())}"); not answered; not started`] }
  if (!found) return { ok: false, lines: [...lines, `pia: no live session after ${Math.round(t.ready / 1000)} s`] }
  const dialog = dialogTitle(deps.tmux.screen())
  if (dialog) return { ok: false, lines: [...lines, `pia: session ${found.id} is up, but a dialog is showing ("${dialog}"); not answered`] }
  if (resume) lines.push(`pia: session ${found.id} live`)
  else {
    deps.recordId(found.id)
    lines.push(`pia: session ${found.id} recorded`)
  }

  const token = deps.token()
  await deps.tmux.paste(`Crew check (crew up pia): this mail reached your terminal, ${token}. No reply needed.`)
  const seen = await waitFor(() => deps.tmux.screen().includes(token), { ms: t.mail, ...clock })
  if (!seen) return { ok: false, lines: [...lines, `pia: test mail ${token} not seen on her screen after ${Math.round(t.mail / 1000)} s`] }
  lines.push(`pia: test mail ${token} pasted and on her screen`)

  // Her board listener is started after the mail check, by her own background command (the one her hook gives her), so her Stop
  // hook counts it and its exit wakes her (Quincy V4, 2026-11-19). The kit waits for its pid.
  const already = deps.listenerUp()
  if (already) return { ok: true, lines: [...lines, `pia: board listener already up (pid ${already})`] }
  await deps.startListener()
  const pid = await waitFor(() => deps.listenerUp(), { ms: t.listener, ...clock })
  if (!pid) return { ok: false, lines: [...lines, `pia: FAIL: board listener did not come up after ${Math.round(t.listener / 1000)} s`] }
  lines.push(`pia: board listener started (pid ${pid})`)
  return { ok: true, lines }
}

// The last non-empty line of a screen, trimmed: where her screen was when a stop did not end her session.
const lastLine = screen => String(screen ?? '').split('\n').map(l => l.trim()).filter(Boolean).pop() ?? ''

const CONFIRM_FOOTER = 'Enter to confirm · Esc to cancel'

/**
 * True when the screen shows the background-shell exit confirm: the footer "Enter to confirm · Esc to cancel" is the last line,
 * and a line within six rows above it says "background" (the running background shell). Any other dialog is not this one.
 */
export function exitConfirmShowing(screen) {
  const rows = String(screen ?? '').split('\n').map(r => r.trim()).filter(Boolean)
  const footer = rows.lastIndexOf(CONFIRM_FOOTER)
  if (footer < 0 || footer !== rows.length - 1) return false
  return rows.slice(Math.max(0, footer - 6), footer).some(r => /background/i.test(r))
}

/** `stop`: /exit, then kill after the grace time; `claude stop` only while claude still lists her session. */
export async function stopPia({ deps, timeouts }) {
  const t = withDefaults(timeouts)
  const clock = { sleep: deps.sleep, poll: t.poll }
  const lines = []
  // Her board listener ends with her: a listener that is still up is stopped too (Quincy V5, 2026-11-19).
  const endListener = () => {
    const pid = deps.listenerUp()
    if (!pid) return
    deps.killListener(pid)
    lines.push(`pia: board listener stopped (pid ${pid})`)
  }
  if (!deps.tmux.has()) {
    lines.push('pia: not running')
    endListener()
    return { ok: true, lines }
  }
  // A dialog on her screen is named and never answered; /exit is never pasted into one (Quincy V1, 2026-11-19).
  const dialog = dialogTitle(deps.tmux.screen())
  if (dialog) lines.push(`pia: a dialog is showing ("${dialog}"); not answered`)
  else {
    await deps.tmux.paste('/exit')
    // The background-shell exit confirm gets one Enter (Boss, 2026-11-19); any other dialog is never answered.
    let answered = false
    const ended = await waitFor(() => {
      if (!deps.tmux.has()) return true
      if (!answered && exitConfirmShowing(deps.tmux.screen())) {
        deps.tmux.key('Enter')
        answered = true
        lines.push('pia: exit confirm answered (Enter, once)')
      }
      return null
    }, { ms: t.grace, ...clock })
    if (ended) {
      lines.push('pia: stopped: her session ended on /exit')
      endListener()
      return { ok: true, lines }
    }
    lines.push(`pia: /exit did not end her session in ${Math.round(t.grace / 1000)} s; her screen ends: "${lastLine(deps.tmux.screen())}"`)
  }
  deps.tmux.kill()
  lines.push('pia: tmux session killed')
  endListener()
  const record = deps.readRecord()
  if (!validSessionId(record?.id)) return { ok: true, lines }
  const listed = (deps.listAgents() ?? []).some(a => a.id === record.id && live(a))
  if (!listed) {
    lines.push(`pia: session ${record.id} not listed after the kill; nothing more to stop`)
    return { ok: true, lines }
  }
  const stopped = deps.stopClaude(record.id)
  lines.push(stopped.ok ? `pia: claude stop ${record.id}` : `pia: claude stop ${record.id} failed: ${stopped.reason}`)
  return { ok: stopped.ok, lines }
}

/** `restart`: stop, then up. */
export async function restartPia({ deps, timeouts }) {
  const down = await stopPia({ deps, timeouts })
  const up = await startPia({ deps, timeouts })
  return { ok: down.ok && up.ok, lines: [...down.lines, ...up.lines] }
}

/** The control command for Pia: up, stop or restart. */
export function piaControl(command, { deps, timeouts } = {}) {
  if (command === 'stop') return stopPia({ deps, timeouts })
  if (command === 'restart') return restartPia({ deps, timeouts })
  return startPia({ deps, timeouts })
}

/** Runs one tmux command on the crew's socket. Returns the spawn result. */
function tmuxRun(home, bin, args, input) {
  return spawnSync(bin, ['-S', join(home, 'tmux.sock'), ...args], { encoding: 'utf8', input, timeout: 15000 })
}

/**
 * The production dependencies: her tmux session on the crew socket, claude (`bin`), her recorded session, her merged settings,
 * her folder trusted the way `crew session start` trusts it, and her board listener's pid file. `opts.name` is her session
 * name (default: the crew's slug and `pia`); `opts.trust` replaces the trust step in a test.
 */
/**
 * The kit folder of a module, as a path with no trailing slash. Both entry points (`crew up pia` through people-control.mjs, and this
 * file run directly) use the kit path from here, so the settings, the trust entry and the --add-dir folder are the same string (Quincy V6).
 */
export function piaKitDir(moduleUrl) {
  return resolve(fileURLToPath(new URL('.', moduleUrl)))
}

export function realPiaDeps(homeIn, kitIn, opts = {}) {
  // Both paths are normalised here, the one place every entry point builds its deps: no trailing slash in the settings or the trust.
  const home = resolve(homeIn)
  const kit = resolve(kitIn)
  const bin = opts.bin || process.env.CREW_CLAUDE_BIN || 'claude'
  const tmuxBin = opts.tmuxBin || process.env.TMUX_BIN || 'tmux'
  const folder = join(home, 'pia-session')
  const name = opts.name || sessionName({ slug: crewSlug(home), key: PIA_KEY })
  const tmux = {
    has: () => tmuxRun(home, tmuxBin, ['has-session', '-t', PIA_TMUX]).status === 0,
    start: (cwd, command) => {
      mkdirSync(cwd, { recursive: true })
      return tmuxRun(home, tmuxBin, ['new-session', '-d', '-s', PIA_TMUX, '-x', '200', '-y', '50', '-c', cwd, command])
    },
    paste: async (text) => {
      const buffer = `crew-pia-${process.pid}-${Date.now()}`
      tmuxRun(home, tmuxBin, ['load-buffer', '-b', buffer, '-'], text)
      tmuxRun(home, tmuxBin, ['paste-buffer', '-p', '-d', '-b', buffer, '-t', PIA_TMUX])
      await new Promise(resolve => setTimeout(resolve, 1000))
      tmuxRun(home, tmuxBin, ['send-keys', '-t', PIA_TMUX, 'Enter'])
    },
    screen: () => tmuxRun(home, tmuxBin, ['capture-pane', '-p', '-t', PIA_TMUX]).stdout ?? '',
    key: key => tmuxRun(home, tmuxBin, ['send-keys', '-t', PIA_TMUX, key]),
    kill: () => tmuxRun(home, tmuxBin, ['kill-session', '-t', PIA_TMUX])
  }
  return {
    tmux,
    folder,
    name,
    command: resume => piaCommand({ home, kit, claude: bin, name, resume }),
    listAgents: () => {
      const run = runClaude(['agents', '--json'], { bin })
      return run.ok ? piaAgentsOf(run.stdout) : null
    },
    readRecord: () => readRecord(home, PIA_KEY),
    recordId: id => writeRecord(home, PIA_KEY, { id, name: PIA_KEY, folder, startedAt: Date.now(), recordedAt: new Date().toISOString() }),
    stopClaude: (id) => {
      const run = runClaude(['stop', id], { bin })
      return run.ok ? { ok: true } : { ok: false, reason: run.stderr || `exit ${run.status}` }
    },
    // A socket file that no tmux server answers for is stale: removed, so the new server can take the path.
    cleanSocket: () => {
      const socket = join(home, 'tmux.sock')
      if (!existsSync(socket)) return
      const probe = spawnSync(tmuxBin, ['-S', socket, 'ls'], { encoding: 'utf8', timeout: 15000 })
      if (probe.status !== 0 && /no server running|Connection refused|No such file/i.test(probe.stderr ?? '')) unlinkSync(socket)
    },
    // Her hooks are written with this crew home and kit: the static pia-session.settings.json has no arguments for the listener hook.
    merge: () => {
      mkdirSync(folder, { recursive: true })
      const session = JSON.parse(readFileSync(join(kit, 'pia-session.settings.json'), 'utf8'))
      session.hooks = piaHooks({ crewHome: home, kitDir: kit })
      // The two --add-dir folders are allowed in her settings, so claude does not ask "Adding a new directory" (Quincy V1).
      session.permissions = { ...(session.permissions ?? {}), additionalDirectories: [home, kit] }
      const sessionFile = join(folder, 'settings.session.json')
      writeFileSync(sessionFile, `${JSON.stringify(session, null, 2)}\n`)
      execFileSync(process.execPath, [join(kit, 'claude.mjs'), 'merge', sessionFile, join(folder, 'settings.merged.json')], { encoding: 'utf8' })
    },
    trust: opts.trust || (() => piaTrust({ home, kit, folder })),
    listenerUp: () => livePid(home, PIA_KEY, LISTENER_MATCH),
    // Her own terminal runs the listener as her background command (see piaListenerInstruction); listen.mjs writes its pid.
    startListener: () => tmux.paste(piaListenerInstruction({ home, kit })),
    // A listener still up after her session is ended is stopped (Quincy V5). SIGTERM only: the pid is the one listen.mjs wrote.
    killListener: (pid) => {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        // The listener was already gone: nothing to stop.
      }
    },
    hasCrewJson: () => existsSync(join(home, 'crew.json')) || existsSync(join(home, 'crew.config.json')),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    token: () => randomBytes(4).toString('hex')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { crewHome } = await import('./home.mjs')
  const home = crewHome()
  const kit = piaKitDir(import.meta.url)
  const command = process.argv[2]
  if (!['up', 'stop', 'restart'].includes(command)) {
    console.error('usage: pia-tmux.mjs up|stop|restart')
    process.exit(64)
  }
  const out = await piaControl(command, { deps: realPiaDeps(home, kit), timeouts: TIMEOUTS })
  for (const line of out.lines) console.log(line)
  process.exit(out.ok ? 0 : 1)
}
