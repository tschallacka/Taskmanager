// Susy daemon, phase 2 (card mwf201blsqvx3jczev): gate wakes. A card that enters Verify PM, UX, CQ or QA wakes the gate's
// owner at once, with one mail: the card, its head and the one thing to do. The daemon only computes the wakes here; it
// mails them (susy-daemon.mjs) and never moves or assigns a card. The first round has no previous columns, so it only
// records them: a card already in a gate at start is not mailed.
import { GATES } from './susy.mjs'

// The tag that passes each gate: the reviewer sets it, the server reads it (PROJECT-RULES.md, "Tags").
export const GATE_TAGS = { 'Verify PM': 'PM approved', 'Verify UX': 'UX approved', 'Verify CQ': 'CQ approved', 'Verify QA': 'QA approved' }
// A head is a short or full commit id a worker names: "head d01e2a8", "Head is ba0a05f now".
const HEAD = /\bhead\b[^0-9a-f\n]{0,30}\b([0-9a-f]{7,40})\b/i

/** The last head a worker names on the card (newest update first), or null. */
export function headOf(card) {
  const updates = [...(card.updates ?? [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  for (const update of updates) {
    const match = HEAD.exec(String(update.body ?? ''))
    if (match) return match[1]
  }
  return null
}

/** One wake's key: the same card entering the same gate at the same change is the same wake, tick after tick. */
export function gateKey(card) {
  return `${card.id}|${card.column}|${card.updatedAt ?? ''}`
}

/**
 * The wakes of one round. `previous` maps card id to the column it had at the last round (undefined on the first round).
 * Returns the wakes and the columns to keep for the next round.
 */
export function gateWakes(cards, previous, { gates = GATES } = {}) {
  const columns = {}
  const wakes = []
  for (const card of cards) {
    columns[card.id] = card.column
    const owner = gates[card.column]
    if (!owner || previous === undefined) continue
    // A card the last round did not see is new to the board, not a move into a gate: no wake.
    if (!(card.id in previous) || previous[card.id] === card.column) continue
    const head = headOf(card)
    const tag = GATE_TAGS[card.column]
    wakes.push({
      key: gateKey(card),
      cardId: card.id,
      title: card.title,
      column: card.column,
      to: owner,
      head,
      tag,
      text: `Card ${card.id} "${card.title}" entered ${card.column}. Head: ${head ?? 'not stated on the card'}. The one thing to do: review it on the board and set the tag "${tag}" when it passes, or send it back.`
    })
  }
  return { wakes, columns }
}

/**
 * What one round does with the wakes. Dry-run (live false) logs each wake and keeps none. Live with the switch on
 * (susy.dispatch.gateWakes is true) keeps each wake as owed until settleGateMail() marks its mail sent, so a failed send
 * is tried again on the next round. Live with the switch off logs that and keeps nothing. No cards (the board was not
 * read): the recorded columns are kept as they were.
 */
export function planGateRound({ cards, state = {}, live = false, enabled = false }) {
  if (!cards) return { columns: state.columns ?? {}, owed: state.owed ?? [], mails: [], lines: [] }
  const { wakes, columns } = gateWakes(cards, state.columns)
  const lines = []
  if (!live) {
    for (const wake of wakes) lines.push(`would mail ${wake.to}: ${wake.text}`)
    return { columns, owed: [], mails: [], lines }
  }
  if (!enabled) {
    for (const wake of wakes) lines.push(`gate wake off (susy.dispatch.gateWakes is not true): ${wake.cardId} to ${wake.to}`)
    return { columns, owed: [], mails: [], lines }
  }
  const owed = [...(state.owed ?? [])]
  for (const wake of wakes) {
    if (!owed.some(item => item.key === wake.key)) owed.push({ key: wake.key, cardId: wake.cardId, column: wake.column, to: wake.to, text: wake.text })
  }
  return { columns, owed, mails: owed.map(item => ({ key: item.key, to: item.to, text: item.text, cardId: item.cardId, mailId: item.mailId })), lines }
}

/** The state with one owed wake removed, once its mail has gone out. */
export function settleGateMail(state, key) {
  return { ...state, owed: (state.owed ?? []).filter(item => item.key !== key) }
}

/**
 * The state with one owed wake marked as queued: the mail is in the outbox, not sent, so the wake stays owed. The mail id is
 * kept, so the next try sends the same row and the endpoint does not take a second copy.
 */
export function noteQueuedGateMail(state, key, mailId) {
  return { ...state, owed: (state.owed ?? []).map(item => (item.key === key ? { ...item, mailId } : item)) }
}
