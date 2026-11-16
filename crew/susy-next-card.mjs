// Susy daemon, phase 3 (card mwf201blsqvx3jczev): the next card by mail. An idle worker (no card In progress) is offered the
// first card of the queue: To do, in board order, unassigned, not blocked, not shipped, and not offered before. The offer
// is a marker on the card first ("Susy: offered to <key> | at <time>"), then one mail. The daemon never moves or assigns
// a card: the worker claims it by setting themself as assignee, and the first claim wins. Pure functions here.
import { WORKERS } from './susy.mjs'

const OFFER = /^Susy: offered to ([\w.-]{1,80}) \| at \S+/

/** The key a Susy offer marker names, or null when the update is not one (only Susy's own markers count). */
export function offerMarkerOf(update) {
  if (!/susy/i.test(String(update?.author ?? ''))) return null
  const match = OFFER.exec(String(update?.body ?? '').trim())
  return match ? match[1] : null
}

function offered(card) {
  return (card.updates ?? []).some(update => offerMarkerOf(update) !== null)
}

function shipped(card) {
  return (card.tags ?? []).includes('shipped') || card.column === 'Done'
}

/** The queue: To do cards nobody holds, in board order, that may be offered. */
export function queueOf(cards) {
  return cards.filter(card => card.column === 'To do' && !card.assignee && !card.completed && !card.blocked && !shipped(card) && !offered(card))
}

/** The mail's one sentence of context: the card's first sentence, cut to 160 characters. */
export function contextOf(card) {
  const first = String(card.description ?? '').trim().split(/(?<=[.!?])\s/)[0] ?? ''
  return first.length > 160 ? `${first.slice(0, 157)}...` : first
}

/** The text of the mail to a worker about one offered card. */
export function offerText(card, to) {
  const context = contextOf(card)
  return `Susy: your next card is ${card.id} "${card.title}" (To do, from Pia's queue). ${context} Claim it by setting yourself as assignee on the board; the first claim wins. Offered to ${to}.`
}

/**
 * The offers of one round. `keyOf` maps a display name to a worker key. An idle worker is one with no card In progress
 * assigned to them. Each queue card goes to at most one worker, the first idle worker in WORKERS order.
 * Returns the offers; each carries the marker to write on the card first, and the mail text.
 */
export function nextCardOffers({ cards, keyOf, at = new Date().toISOString(), workers = WORKERS }) {
  const holding = new Set(cards.filter(card => card.column === 'In progress').map(card => keyOf(card.assignee)).filter(Boolean))
  const idle = workers.filter(key => !holding.has(key))
  const queue = queueOf(cards)
  const offers = []
  let next = 0
  for (const to of idle) {
    if (next >= queue.length) break
    const card = queue[next++]
    offers.push({
      cardId: card.id,
      title: card.title,
      to,
      at,
      marker: `Susy: offered to ${to} | at ${at}`,
      text: offerText(card, to)
    })
  }
  return { offers }
}
