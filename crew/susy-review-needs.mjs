// Susy daemon, phase 4 (card mwf201blsqvx3jczev): one status line of the cards that wait for a human. Boss waits on the cards
// in Verify (Boss reviews them); the owner waits on the open cards labelled owner. A card has waited since its last change.
// Pure functions: the daemon logs the line, and mails Boss when it changes (susy-daemon.mjs).
const HUMAN_DONE = ['Done', 'Ready for live']

/** How long a card has waited, in hours, since its last change. */
function hoursSince(card, now) {
  const at = Date.parse(card.updatedAt)
  return Number.isFinite(at) ? (now - at) / 3600000 : 0
}

/** The cards waiting for Boss and for the owner, longest wait first. */
export function reviewNeeds(cards, now) {
  const waiting = card => ({ id: card.id, title: card.title, hours: hoursSince(card, now) })
  const byWait = (a, b) => b.hours - a.hours
  const boss = cards.filter(card => card.column === 'Verify').map(waiting).sort(byWait)
  const owner = cards
    .filter(card => (card.tags ?? []).includes('owner') && !HUMAN_DONE.includes(card.column) && card.column !== 'Verify')
    .map(waiting)
    .sort(byWait)
  return { boss, owner }
}

/** How long, short: "30m" under an hour, "5h" from an hour on. */
export function howLong(hours) {
  return hours < 1 ? `${Math.round(hours * 60)}m` : `${Math.floor(hours)}h`
}

/** The one status line, or '' when nothing waits for a human. */
export function reviewLine({ boss, owner }) {
  const part = (name, list) => `${name}: ${list.length} (${list.map(c => `${c.id} ${howLong(c.hours)}`).join(', ')})`
  const parts = []
  if (boss.length) parts.push(part('Boss', boss))
  if (owner.length) parts.push(part('Owner', owner))
  return parts.length ? `Waiting for a human. ${parts.join('. ')}.` : ''
}

/**
 * The set of cards waiting, by id, sorted: '' when nothing waits. Only this changes the line's meaning. The times in the
 * line move every minute, so comparing the line would report a change every tick.
 */
export function reviewKey({ boss, owner }) {
  if (!boss.length && !owner.length) return ''
  const ids = list => list.map(c => c.id).sort().join(',')
  return `boss:${ids(boss)}|owner:${ids(owner)}`
}

/**
 * One round of the line. The line is logged (dry-run) or mailed to Boss (live, switch on) only when the set of waiting
 * cards (`key`) changes from the previous round. Live with the switch off logs that. A board that was not read keeps the
 * previous key. The caller stores `key` as the previous key only after a mail went out (or when nothing was mailed), so a
 * failed mail is tried again on the next round.
 */
export function reviewRound({ cards, now, previous = '', live = false, enabled = false }) {
  if (!cards) return { key: previous, line: previous, mail: null, lines: [] }
  const needs = reviewNeeds(cards, now)
  const key = reviewKey(needs)
  const line = reviewLine(needs)
  if (key === previous || key === '') return { key, line, mail: null, lines: [] }
  if (!live) return { key, line, mail: null, lines: [line] }
  if (!enabled) return { key, line, mail: null, lines: [`review needs off (susy.dispatch.reviewNeeds is not true): ${line}`] }
  return { key, line, mail: line, lines: [] }
}

/**
 * The review mail to send this tick: a queued one first (same id and text, so the endpoint does not take a second copy),
 * else the round's new line. Null when there is nothing to send.
 */
export function reviewMailToSend(state, review) {
  if (state.reviewQueued) return state.reviewQueued
  if (!review?.mail) return null
  return { id: undefined, text: review.mail, key: review.key }
}

/**
 * The state after one review send. Sent: the key is stored as the previous key and the queue is cleared. Queued (in the
 * outbox, not sent): the mail is kept for the next tick, and the key is not stored.
 */
export function afterReviewMail(state, send, result) {
  if (!send) return state
  if (result.sent) return { ...state, reviewKey: send.key, reviewQueued: undefined }
  return { ...state, reviewQueued: { id: result.id, text: send.text, key: send.key } }
}
