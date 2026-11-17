#!/usr/bin/env node
// The idle notice (card mwjdf1cyigzw8f1apu): when the board has ready work and nothing has happened for 30 minutes, the
// kit mails Pia and Boss once, and again only when the set of ready cards changes; one line when it is back at work.
// Ready work: a card in To do or in a Verify column, not Done, not blocked (the board's `blocked` flag for an open
// blocker, or a `blocked` or `test failing` label). get_board does not return a card's update text, so a `BLOCKED ON`
// line is not read here: a card that waits on one is moved to Blocked, which is not a ready column.
// "Something happened": a crew member's last step (crew/activity.mjs) or any card update or move on the board.
//   CREW_HOME=<crew home> node idle-ready.mjs            one check (run it from a timer or a Monitor loop)
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const QUIET_MINUTES = 30
const MINUTE = 60_000

const READY_COLUMNS = name => name === 'To do' || /^Verify/.test(name)
const BLOCKED_LABELS = ['blocked', 'test failing']

/** Whether one card is ready work in its column. */
function isReady(task, columnName) {
  if (!READY_COLUMNS(columnName)) return false
  if (task.blocked === true) return false
  if ((task.labels ?? []).some(label => BLOCKED_LABELS.includes(label))) return false
  return true
}

/** The ready cards of the board: [{ id, title, column }], in column order. */
export function readyCards(columns) {
  return columns.flatMap(column => (column.tasks ?? [])
    .filter(task => isReady(task, column.name))
    .map(task => ({ id: task.id, title: task.title, column: column.name })))
}

const toMs = value => (typeof value === 'number' ? value : Date.parse(value))

/**
 * Whether the crew is idle, and the facts for the mail. `activity` rows are crew/activity.mjs rows: { key, mins }. A card
 * update or move counts as activity from any card on the board.
 */
export function idleState({ columns, activity = [], now, quietMinutes = QUIET_MINUTES }) {
  const ready = readyCards(columns)
  const candidates = [
    ...activity.map(row => ({ who: row.key, at: now - row.mins * MINUTE })),
    ...columns.flatMap(column => (column.tasks ?? []).map(task => ({ who: 'board', at: toMs(task.updatedAt) })))
  ].filter(item => Number.isFinite(item.at))
  const last = candidates.reduce((best, item) => (best === null || item.at > best.at ? item : best), null)
  const minutes = last ? Math.max(0, Math.floor((now - last.at) / MINUTE)) : Infinity
  const idle = ready.length > 0 && minutes >= quietMinutes
  return {
    idle,
    ready: ready.map(card => card.id).sort(),
    lastActivity: last ? { who: last.who, at: new Date(last.at).toISOString(), minutes } : null
  }
}

/** The notice for a change of state, or null: `idle` when it becomes idle, `changed` when the ready set changes while idle, `back` when it is over. */
export function noticeFor(prev, next) {
  const was = prev ?? { idle: false, ready: [] }
  const who = next.lastActivity ? `${next.lastActivity.who} ${next.lastActivity.at}` : 'nobody'
  if (next.idle && !was.idle) return { kind: 'idle', text: `idle with ready work: ${next.ready.join(', ')}, last activity ${who}` }
  if (next.idle && was.idle && next.ready.join(',') !== was.ready.join(',')) {
    return { kind: 'changed', text: `still idle, ready work changed: ${next.ready.join(', ')}, last activity ${who}` }
  }
  if (!next.idle && was.idle) return { kind: 'back', text: 'back at work: the board has ready work and the crew is working again' }
  return null
}

/**
 * One check: reads the saved state, works out the new one, mails the notice (if any) to Pia and Boss, and saves the new
 * state. `store` is { read(), write(state) }; `send` is (to, text). Returns the notice sent, or null.
 */
export function runIdleCheck({ columns, activity, now, store, send }) {
  const prev = store.read()
  const next = idleState({ columns, activity, now })
  const notice = noticeFor(prev, next)
  store.write({ idle: next.idle, ready: next.ready })
  if (notice) {
    send('pia', notice.text)
    send('boss', notice.text)
  }
  return notice
}

// The command: reads the board and the crew's activity, and keeps its state in CREW_HOME/.idle-ready.json.
async function main() {
  const { loadCreds, here } = await import('./config.mjs')
  const { activityRows, readCmdlines, piaProjectsDir } = await import('./activity.mjs')
  const { sendMail } = await import('./mail-client.mjs')
  const creds = loadCreds()
  const key = creds.people.boss.apiKey
  const res = await fetch(`${creds.base}/api/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream', 'authorization': `Bearer ${key}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_board', arguments: { board: creds.board.id } } })
  })
  const board = JSON.parse((await res.json()).result?.content?.[0]?.text ?? 'null')
  const cmdlines = readCmdlines()
  const activity = activityRows({ root: piaProjectsDir(here), hours: 6, now: Date.now(), cmdlines, alive: true })
  const file = join(here, '.idle-ready.json')
  const store = {
    read: () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null),
    write: state => writeFileSync(file, JSON.stringify(state))
  }
  const send = (to, text) => sendMail({
    base: creds.base, slug: creds.crew?.slug, key, to, text,
    mailboxDir: join(here, 'mailbox'), makeId: () => crypto.randomUUID().replaceAll('-', '')
  })
  const sendNow = (to, text) => {
    send(to, text).catch((error) => {
      console.error(`idle-ready: mail to ${to} failed: ${error?.message ?? error}`)
    })
  }
  const notice = runIdleCheck({ columns: board?.columns ?? [], activity, now: Date.now(), store, send: sendNow })
  console.log(notice ? `sent: ${notice.text}` : 'nothing to send')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`idle-ready: ${error?.message ?? error}`)
    process.exitCode = 1
  })
}
