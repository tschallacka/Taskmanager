import { routes } from '../actor'

// Susy Secretary's state, from the board: which people she has to poke, and what her poke markers say. The rules are
// pure, so they can be tested without a renderer or a board. Her thresholds are the Susy card's; her marker and escalation
// rules are the ones the card's customer updates set (a poke is tied to a reason, a stale marker is cleared, a poke
// that did nothing goes one step up, a Done card is never poked).

export type Reason
  = | 'unanswered question'
    | 'worker idle'
    | 'gate untouched'
    | 'ready to clean unassigned'
    | 'clean plan unchecked'
    | 'cleaning not started'
    | 'clean done unchecked'

export interface PokeUpdate {
  /** The crew key of the author (`pia`, `wick`, ...), or '' for someone outside the crew. */
  by: string
  body: string
  /** Epoch milliseconds. */
  at: number
}

export interface PokeCard {
  column: string
  assignee: string | null
  tags: string[]
  /** When each tag was last set on the card (epoch milliseconds). A tag with no time is treated as just set. */
  tagSince: Record<string, number>
  /** When the card entered its current column. */
  enteredColumnAt: number
  updates: PokeUpdate[]
  /** When the card last changed in any way (an update, a move, a tag). */
  lastChangeAt: number
}

export interface Poke {
  target: string
  reason: Reason
}

/** A poke already made. `count` is how many times it went out for this reason at this person. */
export interface Marker extends Poke {
  at: number
  count: number
}

const MINUTE = 60_000

/** How long a reason must hold before a poke goes out (or goes out again). */
export const THRESHOLD_MINUTES: Record<Reason, number> = {
  'unanswered question': 10,
  'worker idle': 10,
  'gate untouched': 15,
  'ready to clean unassigned': 5,
  'clean plan unchecked': 10,
  'cleaning not started': 5,
  'clean done unchecked': 15
}

/** The reviewer each gate column waits for. */
const GATE_OWNER: Record<string, string> = { 'Verify UX': 'usher', 'Verify CQ': 'nina', 'Verify QA': 'quincy' }

/** The cleanup tags, and the person each one is waiting on. */
const CLEANUP_TAG = 'ready to clean'

function minutesSince(at: number, now: number): number {
  return (now - at) / MINUTE
}

/** A card that is finished is never poked: Done, or the janitor has cleaned it. */
export function isFinished(card: PokeCard): boolean {
  return card.column === 'Done' || card.tags.includes('cleaned')
}

function lastBy(card: PokeCard, predicate: (update: PokeUpdate) => boolean): number | null {
  const times = card.updates.filter(predicate).map(update => update.at)
  return times.length ? Math.max(...times) : null
}

function tagTime(card: PokeCard, tag: string): number {
  return card.tagSince[tag] ?? card.lastChangeAt
}

/**
 * Every poke that holds right now, from the card as it is. Nothing here reads a marker: a reason that holds is a poke,
 * whether or not one went out before. A finished card gives none.
 */
export function pokesFor(card: PokeCard, now: number): Poke[] {
  if (isFinished(card)) return []
  const pokes: Poke[] = []
  const add = (target: string, reason: Reason, since: number) => {
    if (minutesSince(since, now) >= THRESHOLD_MINUTES[reason]) pokes.push({ target, reason })
  }

  // A question to Pia with no answer from her after it.
  const question = card.updates.filter(update => update.body.startsWith('QUESTION:')).at(-1)
  if (question && !card.updates.some(update => update.by === 'pia' && update.at > question.at)) {
    add('pia', 'unanswered question', question.at)
  }

  // A worker with the card in progress and no update from them since it came in (or since they last wrote).
  if (card.column === 'In progress' && card.assignee) {
    const lastFromWorker = lastBy(card, update => update.by === card.assignee)
    add(card.assignee, 'worker idle', Math.max(card.enteredColumnAt, lastFromWorker ?? 0))
  }

  // A gate whose reviewer has not picked the card up.
  const gate = GATE_OWNER[card.column]
  if (gate) {
    const lastUpdate = lastBy(card, () => true) ?? 0
    add(gate, 'gate untouched', Math.max(card.enteredColumnAt, lastUpdate))
  }

  // The cleanup flow: each step has a person it waits on.
  if (card.tags.includes(CLEANUP_TAG) && card.assignee !== 'janet') {
    add('pia', 'ready to clean unassigned', tagTime(card, CLEANUP_TAG))
  }
  if (card.tags.includes('clean plan') && !card.tags.includes('cleaning granted')) {
    add('pia', 'clean plan unchecked', tagTime(card, 'clean plan'))
  }
  if (card.tags.includes('cleaning granted') && card.assignee === 'janet') {
    const lastFromJanet = lastBy(card, update => update.by === 'janet' && update.at >= tagTime(card, 'cleaning granted'))
    if (lastFromJanet === null) add('janet', 'cleaning not started', tagTime(card, 'cleaning granted'))
  }
  if (card.tags.includes('clean done')) {
    add('pia', 'clean done unchecked', tagTime(card, 'clean done'))
  }
  return pokes
}

/** What Susy does with each poke: send it, repeat it once, or escalate it. Escalation is one step up. */
export interface Round {
  /** Pokes to post now, with the marker each one leaves. */
  send: Marker[]
  /** Markers kept as they are: the reason holds and the poke is already out. */
  keep: Marker[]
}

/** The step above a person: a worker or a reviewer goes to Pia, Pia goes to Boss. */
export function escalationTarget(target: string): string {
  return target === 'pia' ? 'boss' : 'pia'
}

/**
 * Works out this round from the markers of earlier rounds. A marker whose card changed since it was made is stale and
 * is dropped; a marker whose reason no longer holds is dropped. A poke that holds and is already out is kept, and is
 * sent again once after its threshold; if the same person does not act after that, the poke goes one step up, once.
 */
export function reconcile(card: PokeCard, markers: Marker[], now: number): Round {
  if (isFinished(card)) return { send: [], keep: [] }
  const current = pokesFor(card, now)
  const send: Marker[] = []
  const keep: Marker[] = []
  for (const poke of current) {
    const marker = markers.find(m => m.target === poke.target && m.reason === poke.reason)
    const fresh = marker && marker.at >= card.lastChangeAt
    if (!marker || !fresh) {
      send.push({ ...poke, at: now, count: 1 })
      continue
    }
    if (minutesSince(marker.at, now) < THRESHOLD_MINUTES[poke.reason]) {
      keep.push(marker)
      continue
    }
    if (marker.count === 1) {
      send.push({ ...poke, at: now, count: 2 })
      continue
    }
    // Two pokes went out and nothing changed: one step up, once.
    const up = escalationTarget(poke.target)
    const already = markers.find(m => m.target === up && m.reason === poke.reason)
    if (!already) send.push({ target: up, reason: poke.reason, at: now, count: 1 })
    else keep.push(already)
  }
  return { send, keep }
}

// ── The office's piece: Susy walks to the desk of the person she pokes, pauses there, and carries the count as a badge.
// Her markers live with the caller (the office keeps them between rounds), so the data carries them in.

export interface SusyData {
  card: PokeCard
  markers: Marker[]
  now: number
}

export interface SusyState {
  target: string
  reason: Reason
  /** How many pokes go out this round, shown as her badge. */
  pokes: number
}

/** The pause at each desk she pokes, in seconds: brief, so the office does not stall on her. */
export const POKE_STOP_SECONDS = 3

routes.register<SusyData, SusyState>('susy', {
  stateOf: ({ card, markers, now }) => {
    const { send } = reconcile(card, markers, now)
    const first = send[0]
    return first ? { target: first.target, reason: first.reason, pokes: send.length } : null
  },
  plan: ({ target, pokes }) => routes.walkToDesk(target, 'none', { stopSeconds: POKE_STOP_SECONDS, badge: pokes })
})
