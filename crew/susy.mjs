#!/usr/bin/env node
// Susy, the secretary who pokes people awake. She never does anyone's work, moves no card and starts nobody.
//   crew susy check                 one round: reads the crew board and prints what needs a poke, or a clear, one line each
//   crew susy agent <key> <id>      remember the agent id of a running person (for SendMessage); "-" as id forgets it
// The board is her memory. Each poke is written on the card as an update by her ("poked <to> | <reason> | at <time>"),
// and a poke that no longer holds is closed with "cleared <to> | <reason> | at <time>". Nothing is kept in a file
// about what was found, so a round works out what is needed from the board as it is now. A file in CREW_HOME/.listen
// holds only the agent ids for SendMessage (written by Pia, or with `agent`) and the time of the last round.
// Rules, thresholds and ladder: see SUSY.md.tmpl. Thresholds come from "susy" in crew.json, with the defaults below.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { crewHome } from './home.mjs'
import { renameKeys } from './keys.mjs'
import { rpcResult } from './mentions.mjs'
import { blockedOnOf } from './blocked-on.mjs'

export const DEFAULTS = { questionMinutes: 10, idleMinutes: 10, gateMinutes: 15, cleanGrantMinutes: 5, cleanPlanMinutes: 10, cleanDoneMinutes: 15, stuckMinutes: 240 }
export const WORKERS = ['wren', 'wick', 'wynn', 'wade']
export const AGENTS = ['pia', ...WORKERS, 'usher', 'nina', 'quincy']
export const GATES = { 'Verify PM': 'pia', 'Verify UX': 'usher', 'Verify CQ': 'nina', 'Verify QA': 'quincy' }
// The default display names, the same as config.mjs gives them. A crew.json "people" entry replaces one.
export const NAMES = {
  pia: 'Pia Planner', wren: 'Wren Worker', wick: 'Wick Worker', wynn: 'Wynn Worker', wade: 'Wade Worker',
  usher: 'Usher Xander', nina: 'Nina Nitpick', quincy: 'Quincy Average', susy: 'Susy Secretary',
  janet: 'Janet Janitor', pat: 'Pat Precheck', tess: 'Tess Triage', rita: 'Rita Reporter'
}
export const DEFAULT_CLEANER = 'janet'
// A card in one of these columns is waiting by design, so the stuck-column rule does not look at it.
export const RESTING = ['Backlog', 'Blocked', 'Ready for live', 'Done']
// Stuck-column rule: a card is stuck when it has been in its column at least stuckMinutes, and more than STUCK_FACTOR
// times the median time of the other cards in that column (at least two others).
export const STUCK_FACTOR = 3
const MIN = 60000
const STALE_ROUND_MINUTES = 5
// Her markers: `poked <to> | <reason> | at <time>`, or `cleared ...`. Since card mwcytequ3yduaddw3o4 each also carries
// `| was <time>`: the card's time as she read it before her post, so a move with no update of its own is not lost.
const LEDGER = /^(poked|cleared) (\S+) \| (.+?) \| at (\S+)(?: \| was (\S+))?\s*$/
const AGENT_ID = /^[\w.-]{1,80}$/

/** Thresholds in minutes: the defaults, with any valid number from crew.json's "susy" block. */
export function thresholdsFrom(crew) {
  const given = crew?.susy ?? {}
  const out = {}
  for (const [name, fallback] of Object.entries(DEFAULTS)) {
    out[name] = Number.isFinite(given[name]) && given[name] > 0 ? given[name] : fallback
  }
  return out
}

/** The agent key of an update's author: "crew pia (agent)" is pia, a person or anything else is null. */
export function authorKey(author) {
  const match = /^crew (\w+) \(agent\)$/.exec(String(author ?? ''))
  return match ? match[1] : null
}

/** A function from a display name on the board ("Wynn Worker") to a person key, from the crew's names. */
export function keyOfName(people = {}) {
  const names = { ...NAMES, ...renameKeys(people) }
  const byName = new Map(Object.entries(names).map(([key, name]) => [name, key]))
  return name => byName.get(name)
}

/** The median of a list of numbers (the mean of the two middle ones for an even count). */
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * The agents map with one person's id set, or removed with "-". Returns a new object; the id must be a plain word,
 * so a value that could break a SendMessage target is refused.
 */
export function setAgent(agents, key, id) {
  if (!/^\w+$/.test(String(key ?? ''))) throw new Error(`susy: "${key}" is not a person key`)
  const next = { ...(agents ?? {}) }
  if (id === '-') {
    delete next[key]
    return next
  }
  if (!AGENT_ID.test(String(id ?? ''))) throw new Error(`susy: "${id}" is not an agent id`)
  next[key] = id
  return next
}

/** The Susy ledger on a card: her own poked/cleared updates, oldest first. */
function ledgerOf(card) {
  return (card.updates ?? [])
    .filter(update => authorKey(update.author) === 'susy')
    .map((update) => {
      const match = LEDGER.exec(String(update.body).trim())
      return match ? { kind: match[1], to: match[2], reason: match[3], at: Date.parse(match[4]) } : null
    })
    .filter(Boolean)
    .sort((a, b) => a.at - b.at)
}

// The board moves a card's updatedAt when anyone posts on it, Susy included. Her own posts are within this slack of it.
const OWN_POST_SLACK = 2000

/** The card's time as Susy read it before her post, from a `| was <time>` at the end of her update, or NaN. */
function wasOf(update) {
  const match = /\| was (\S+)\s*$/.exec(String(update.body).trim())
  return match ? Date.parse(match[1]) : NaN
}

/**
 * Every time the card changed by someone other than Susy: each update by anyone but her; a move or an edit (the card's own
 * time, which leaves no update); and the card time her post replaced (`was`), which a later post of hers would hide. Her own
 * posts never count as a change (card mwcytequ3yduaddw3o4).
 */
function changeTimes(card) {
  const updates = card.updates ?? []
  const susy = updates.filter(update => authorKey(update.author) === 'susy')
  const susyAt = susy.map(update => Date.parse(update.at))
  const mine = t => susyAt.some(s => Math.abs(s - t) <= OWN_POST_SLACK)
  const times = updates.filter(update => authorKey(update.author) !== 'susy').map(update => Date.parse(update.at))
  for (const update of susy) {
    const was = wasOf(update)
    if (Number.isFinite(was) && !mine(was)) times.push(was)
  }
  const own = card.updatedAt
  if (Number.isFinite(own) && !mine(own)) times.push(own)
  return times.filter(Number.isFinite)
}

/**
 * The time of the latest change by someone other than Susy. With none known, the card has been in this state since before
 * her first post on it, so that post's time minus one millisecond (it still counts as a poke after the start).
 */
function lastChange(card) {
  const times = changeTimes(card)
  if (times.length) return Math.max(...times)
  const susyPosts = (card.updates ?? []).filter(update => authorKey(update.author) === 'susy').map(update => Date.parse(update.at)).filter(Number.isFinite)
  return susyPosts.length ? Math.min(...susyPosts) - 1 : card.updatedAt
}

/** Updates by agents whose keys are in `keys` (or by anyone but Susy when `keys` is null), at or after `since`. */
function postedBy(card, keys, since) {
  return (card.updates ?? []).some((update) => {
    const key = authorKey(update.author)
    const fits = keys ? keys.includes(key) : key !== 'susy'
    return fits && Date.parse(update.at) > since
  })
}

/**
 * Walks one card's Susy ledger for one reason against the board as it is now.
 * `c` is a candidate: { reason, ladder (who to poke, in order), since (ms: when the condition started), threshold (minutes),
 * active (the condition holds now) }. A poke goes to ladder[floor(pokes / 2)], where pokes counts the pokes since the card
 * last changed: the first two go to the first name, the next two to the second, and after the last rung the card is
 * quiet. A poke waits a full threshold after the previous one, or after `since` for the first.
 */
export function evaluate(card, c, now, ctx) {
  const actions = []
  const ledger = ledgerOf(card).filter(event => event.reason === c.reason)
  const last = ledger.at(-1)
  const open = last?.kind === 'poked'
  const timeline = [
    ...ledger.filter(event => event.at > c.since).map(event => ({ t: event.at, kind: event.kind })),
    ...changeTimes(card).filter(t => t > c.since).map(t => ({ t, kind: 'change' }))
  ].sort((a, b) => a.t - b.t)
  let pokes = 0
  let lastPoke = null
  for (const event of timeline) {
    if (event.kind === 'poked') {
      pokes++
      lastPoke = event.t
    } else {
      pokes = 0
      lastPoke = null
    }
  }
  if (!c.active) {
    if (open) actions.push(clearAction(card, last, c.reason, now))
    return actions
  }
  // A poke whose card changed under it is stale: close it, then poke anew from zero when the reason still holds.
  if (open && pokes === 0) {
    actions.push(clearAction(card, last, c.reason, now))
  }
  const rung = Math.floor(pokes / 2)
  if (rung >= c.ladder.length) return actions
  const waitFrom = pokes === 0 ? c.since : lastPoke
  if (now - waitFrom >= c.threshold * MIN) {
    actions.push(pokeAction(card, c, c.ladder[rung], now, ctx))
  }
  return actions
}

/** The ` | was <time>` tail of her marker: the card's time as she read it, before this post moves it. */
function wasPart(card) {
  return Number.isFinite(card.updatedAt) ? ` | was ${new Date(card.updatedAt).toISOString()}` : ''
}

function clearAction(card, last, reason, now) {
  return {
    kind: 'clear',
    cardId: card.id,
    reason,
    marker: `cleared ${last.to} | ${reason} | at ${new Date(now).toISOString()}${wasPart(card)}`,
    text: `clear "${reason}" on ${card.id} "${card.title}": the card changed or the reason ended`
  }
}

function pokeAction(card, c, to, now, ctx) {
  const who = to === 'boss' ? '@cato (Boss)' : to
  const agent = ctx.agents?.[to]
  const how = to === 'boss' ? 'write @cato' : agent ? `SendMessage to agent ${agent}` : `@${to} in a card update (no agent id)`
  const minutes = Math.floor((now - c.since) / MIN)
  const say = suggestedMessage(c.reason, card, to)
  return {
    kind: 'poke',
    to,
    reason: c.reason,
    cardId: card.id,
    marker: `poked ${to} | ${c.reason} | at ${new Date(now).toISOString()}${wasPart(card)}`,
    text: `poke ${who} on ${card.id} "${card.title}": ${c.reason} (${minutes} min; ${how}). Say: ${say}`
  }
}

/**
 * The one thing the poked session should do, per reason. It names the card by id and title only: never the card's
 * body, an update, or a key. The running Susy session sends it (SendMessage by agent id, or an @mention on the card).
 */
export function suggestedMessage(reason, card, to) {
  const ask = {
    'unanswered question': `answer the question on ${card.id} "${card.title}" (get_task, prefix QUESTION)`,
    'in progress, no update': `post what you did on ${card.id} "${card.title}" or move it back to To do`,
    'assigned, not started': `start ${card.id} "${card.title}" (move it to In progress) or say why not`,
    'gate untouched': `review ${card.id} "${card.title}" in ${card.column} and post your result`,
    'stuck in column': `move ${card.id} "${card.title}" on, or post why it is waiting`,
    'blocked by an unowned card': `give the blocker of ${card.id} "${card.title}" an owner`,
    'blocked in a cycle': `break the blocker cycle that includes ${card.id} "${card.title}"`,
    'ready to clean, not assigned to cleaner': `assign the cleaner to ${card.id} "${card.title}"`,
    'clean plan, no check': `check the clean plan on ${card.id} "${card.title}"`,
    'cleaning granted, cleaner not working': `start cleaning ${card.id} "${card.title}"`,
    'clean done, not checked': `check the clean on ${card.id} "${card.title}"`
  }
  return `"${ask[reason] ?? `act on ${card.id} "${card.title}"`}" (to ${to})`
}

/** Every reason Susy checks for one card, each with its condition. A reason that does not hold is still listed, so its open poke closes. */
export function candidatesFor(card, th, ctx) {
  const out = []
  const finished = Boolean(card.completed) || card.column === 'Done' || card.tags.includes('cleaned')
  const add = (reason, ladder, since, threshold, active) => out.push({
    reason,
    ladder: [...new Set([ladder, 'pia', 'boss'])],
    since,
    threshold,
    active: active && !finished
  })
  const lastChanged = lastChange(card)
  const key = ctx.keyOf(card.assignee)

  // A question to Pia (or an @pia mention) from an agent that Pia has not answered since.
  const ask = [...(card.updates ?? [])].reverse().find(update => AGENTS.includes(authorKey(update.author)) && authorKey(update.author) !== 'pia' && (/^QUESTION:/i.test(String(update.body).trim()) || /@pia\b/i.test(String(update.body))))
  const answered = ask ? postedBy(card, ['pia'], Date.parse(ask.at) - 1) : true
  add('unanswered question', 'pia', ask ? Date.parse(ask.at) : 0, th.questionMinutes, Boolean(ask) && !answered)

  // A worker's card in progress with no update since its last change.
  add('in progress, no update', key ?? 'pia', lastChanged, th.idleMinutes, card.column === 'In progress' && WORKERS.includes(key))
  // A worker's card in To do that the worker has not started, while the worker has no card in progress.
  add('assigned, not started', key ?? 'pia', lastChanged, th.idleMinutes, card.column === 'To do' && WORKERS.includes(key) && !ctx.busy.has(key))

  // A review gate that the owner has not posted on since the card entered it.
  const owner = GATES[card.column]
  add('gate untouched', owner ?? 'pia', lastChange(card), th.gateMinutes, Boolean(owner) && !postedBy(card, [owner], lastChange(card)))

  // Stuck in its column: far longer than the other cards in the same column (see STUCK_FACTOR).
  const age = ctx.now - lastChange(card)
  const others = (ctx.columnCards.get(card.column) ?? []).filter(other => other.id !== card.id).map(other => other.age)
  add('stuck in column', key ?? 'pia', lastChange(card), th.idleMinutes,
    !RESTING.includes(card.column) && others.length >= 2 && age >= th.stuckMinutes * MIN && age > STUCK_FACTOR * median(others))

  // Blocked by a card with no owner, or in a cycle of blockers.
  const unowned = (card.blockedBy ?? []).some((id) => {
    const blocker = ctx.byId.get(id)
    return blocker && !blocker.assignee && !blocker.completed && blocker.column !== 'Done'
  })
  add('blocked by an unowned card', 'pia', lastChange(card), th.idleMinutes, Boolean(card.blocked) && unowned)
  add('blocked in a cycle', 'pia', lastChange(card), th.idleMinutes, ctx.cycle.has(card.id))

  // The cleaning tags: a card that is ready to clean, planned, granted, or done.
  const tags = card.tags
  const cleaner = ctx.cleaner
  add('ready to clean, not assigned to cleaner', 'pia', lastChange(card), th.idleMinutes, tags.includes('ready to clean') && key !== cleaner)
  add('clean plan, no check', 'pia', lastChange(card), th.cleanPlanMinutes, tags.includes('clean plan') && !tags.includes('cleaning granted') && !postedBy(card, null, lastChange(card)))
  add('cleaning granted, cleaner not working', cleaner, lastChange(card), th.cleanGrantMinutes, tags.includes('cleaning granted') && !tags.includes('clean done') && !postedBy(card, [cleaner], lastChange(card)))

  // A card in Blocked that names whom it waits for (its BLOCKED ON line, blocked-on.mjs): that person is poked after the
  // normal threshold, then the PM. Only a card with a line is poked here; a Blocked card with no line is not poked by this
  // (a finding for the PM, to be ruled on separately).
  const blockedOn = blockedOnOf(card.updates ?? [])
  const namedKey = blockedOn && [...AGENTS, 'boss'].includes(blockedOn.key) ? blockedOn.key : null
  add(`blocked, waiting on ${namedKey}`, namedKey ?? 'pia', lastChange(card), th.idleMinutes, card.column === 'Blocked' && Boolean(namedKey))
  add('clean done, not checked', 'pia', lastChange(card), th.cleanDoneMinutes, tags.includes('clean done') && !tags.includes('cleaned') && !postedBy(card, ['pia'], lastChange(card)))
  return out
}

/** The cards that close a cycle of blockers (any card on a loop of blockedBy links). */
export function cycleCards(cards) {
  const byId = new Map(cards.map(card => [card.id, card]))
  const onCycle = new Set()
  for (const card of cards) {
    const seen = []
    let stack = [...(card.blockedBy ?? [])]
    const visited = new Set()
    while (stack.length) {
      const id = stack.pop()
      if (id === card.id) {
        seen.forEach(x => onCycle.add(x))
        onCycle.add(card.id)
        break
      }
      if (visited.has(id) || !byId.has(id)) continue
      visited.add(id)
      seen.push(id)
      stack = [...stack, ...(byId.get(id).blockedBy ?? [])]
    }
  }
  return onCycle
}

/**
 * One round, without the network: the actions for the cards (poke, clear) and the lines to print.
 * `opts`: { now (ms), thresholds, keyOf (display name to key), cleaner (key), agents ({key: agent id}) }.
 */
export function findPokes(cards, opts) {
  const now = opts.now
  const th = thresholdsFrom({ susy: opts.thresholds ?? {} })
  const byId = new Map(cards.map(card => [card.id, card]))
  const busy = new Set(cards.filter(card => card.column === 'In progress').map(card => opts.keyOf(card.assignee)).filter(Boolean))
  const columnCards = new Map()
  for (const card of cards) {
    const list = columnCards.get(card.column) ?? []
    list.push({ id: card.id, age: now - lastChange(card) })
    columnCards.set(card.column, list)
  }
  const ctx = { keyOf: opts.keyOf, byId, busy, cycle: cycleCards(cards), cleaner: opts.cleaner ?? DEFAULT_CLEANER, agents: opts.agents ?? {}, now, columnCards }
  const actions = []
  for (const card of cards) {
    for (const c of candidatesFor(card, th, ctx)) actions.push(...evaluate(card, c, now, ctx))
  }
  return { actions, lines: actions.map(action => action.text) }
}

/** A line when the last round was long ago: Susy herself was not woken, which is Boss's `crew watch` finding. */
export function staleRoundLine(lastRound, now) {
  const at = Date.parse(lastRound)
  if (!Number.isFinite(at)) return null
  const minutes = Math.floor((now - at) / MIN)
  return minutes > STALE_ROUND_MINUTES ? `susy: last round ${minutes} min ago; Susy was not woken (crew watch)` : null
}

/** The cards from a get_board answer, with their updates. A card with no updates gets an empty list. */
export function cardsFrom(board, updatesOf) {
  return (board?.columns ?? []).flatMap(column => (column.tasks ?? []).map(task => ({
    id: task.id,
    title: task.title,
    column: column.name,
    assignee: task.assignee,
    tags: task.labels ?? [],
    completed: Boolean(task.completed),
    updatedAt: Date.parse(task.updatedAt),
    blocked: Boolean(task.blocked),
    blockedBy: task.blockedBy ?? [],
    updates: updatesOf?.[task.id] ?? []
  })))
}

function readJson(path, fallback) {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback
  } catch {
    return fallback
  }
}

/** `crew susy agent <key> <id>`: set or forget one person's agent id in CREW_HOME/.listen/susy.json. */
function agentCommand(home, key, id) {
  const statePath = `${home}/.listen/susy.json`
  const state = readJson(statePath, {})
  const agents = setAgent(state.agents, key, id)
  mkdirSync(`${home}/.listen`, { recursive: true })
  writeFileSync(statePath, `${JSON.stringify({ ...state, agents })}\n`, { mode: 0o600 })
  console.log(id === '-' ? `susy: no agent id for ${key} now` : `susy: ${key} is agent ${id}`)
  return 0
}

async function main() {
  const home = crewHome()
  if (process.argv[2] === 'agent') {
    try {
      return agentCommand(home, process.argv[3], process.argv[4])
    } catch (error) {
      console.error(error.message)
      return 64
    }
  }
  if (process.argv[2] !== 'check') {
    console.error('usage: crew susy check | crew susy agent <key> <id|->')
    return 64
  }
  const crew = readJson(`${home}/crew.json`, null) ?? readJson(`${home}/crew.config.json`, null)
  if (!crew) {
    console.error(`susy: no crew.json in ${home}`)
    return 78
  }
  const creds = readJson(`${home}/creds.json`, {})
  const key = process.env.SUSY_API_KEY || creds.people?.susy?.apiKey
  if (!key) {
    console.error('susy: no account yet (no people.susy in creds.json). Nothing is checked.')
    return 65
  }
  const boardId = creds.board?.id
  let id = 1
  const call = async (name, args) => {
    const res = await fetch(`${creds.base}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream', 'authorization': `Bearer ${key}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name, arguments: args } }),
      signal: AbortSignal.timeout(30000)
    })
    if (!res.ok) throw new Error(`${name} answered HTTP ${res.status}`)
    return rpcResult(name, await res.json())
  }

  const statePath = `${home}/.listen/susy.json`
  const state = readJson(statePath, {})
  const now = Date.now()
  const lines = []
  const stale = state.lastRound ? staleRoundLine(state.lastRound, now) : null
  if (stale) lines.push(stale)

  const board = await call('get_board', { board: boardId, detail: 'titles', limit: 200 })
  const updatesOf = {}
  for (const column of board?.columns ?? []) {
    for (const task of column.tasks ?? []) {
      if (!Number(task.updates)) continue
      // The newest 200, then put in time order: a card over 200 updates keeps its latest changes and her latest pokes.
      const full = await call('get_task', { id: task.id, order: 'newest', limit: 200 })
      updatesOf[task.id] = (full?.updates ?? [])
        .map(update => ({ id: update.id, author: update.author, body: update.body, at: update.at }))
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    }
  }
  const cards = cardsFrom(board, updatesOf)
  const keyOf = keyOfName(crew.people)
  const cleaner = crew.susy?.cleaner ?? DEFAULT_CLEANER
  const round = findPokes(cards, { now, thresholds: crew.susy, keyOf, cleaner, agents: state.agents })
  lines.push(...round.lines)
  if (!round.lines.length) lines.push('susy: nothing to poke')
  mkdirSync(`${home}/.listen`, { recursive: true })
  writeFileSync(statePath, `${JSON.stringify({ ...state, lastRound: new Date(now).toISOString() })}\n`, { mode: 0o600 })
  console.log(lines.join('\n'))
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then((code) => {
    process.exitCode = code
  }, (error) => {
    console.log(`susy: ${error.message}`)
    process.exitCode = 1
  })
}
