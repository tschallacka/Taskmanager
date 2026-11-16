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
 * One round of the line. The line is logged (dry-run) or mailed to Boss (live, switch on) only when it changes from the
 * previous round. Live with the switch off logs that. A board that was not read keeps the previous line. The caller
 * stores `line` as the previous line only after a mail went out, so a failed mail is tried again on the next round.
 */
export function reviewRound({ cards, now, previous = '', live = false, enabled = false }) {
  if (!cards) return { line: previous, mail: null, lines: [] }
  const line = reviewLine(reviewNeeds(cards, now))
  if (line === previous || line === '') return { line, mail: null, lines: [] }
  if (!live) return { line, mail: null, lines: [line] }
  if (!enabled) return { line, mail: null, lines: [`review needs off (susy.dispatch.reviewNeeds is not true): ${line}`] }
  return { line, mail: line, lines: [] }
}
