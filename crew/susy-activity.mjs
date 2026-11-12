// Susy's activity and Pia-liveness checks (card mwdbhbl2, Boss's requirements 1 to 6): the decision logic only. Each
// function takes the evidence it needs and returns the lines the daemon logs. Nothing here reads a file, runs a command or
// touches the board: the collector that gathers the evidence (session state, transcript times, the listener and round
// timer, mail read times) is separate. Dry-run logs these lines; live mode will act on them.
export const MIN = 60000
export const ACTIVE_MINUTES = 5
export const IDLE_MINUTES = 10
export const WAIT_MINUTES = 45
export const LISTENER_DOWN_MINUTES = 3
export const ROUND_SILENT_MINUTES = 20
export const MAIL_UNREAD_MINUTES = 5
export const HANDBACK_MINUTES = 5
export const UNASSIGNED_IDLE_MINUTES = 15
export const GO_LOAD_MINUTES = 10
export const VERIFY_MINUTES = 30
export const QUESTION_MINUTES = 30

/**
 * A person's state, from evidence: 'gone' when the session is not running; 'waiting' when a recorded WAITING marker holds
 * (younger than 45 minutes); 'working' when there was activity in the last 5 minutes; otherwise 'idle'.
 */
export function personState({ session, lastActivityMs, waiting, now }) {
  if (session !== 'running') return 'gone'
  if (waiting) return 'waiting'
  if (lastActivityMs != null && now - lastActivityMs <= ACTIVE_MINUTES * MIN) return 'working'
  return 'idle'
}

/** A WAITING marker on a card: `WAITING <for what> since <iso time>`. Null unless it is a marker younger than 45 minutes. */
export function waitingOf(update, now) {
  const match = /^WAITING (.+?) since (\S+)\s*$/m.exec(String(update?.body ?? ''))
  if (!match) return null
  const since = Date.parse(match[2])
  if (!Number.isFinite(since) || now - since >= WAIT_MINUTES * MIN) return null
  return { for: match[1], since }
}

/**
 * One line per worker with a card in In progress (assigned to them, not blocked) who is idle for 10 minutes, or whose
 * session is gone (`needs resume`, to Pia at once). A waiting person is never poked: the wait is the answer.
 * `people`: [{ key, card, blocked, state, idleMs, lastUpdate }], with state from personState.
 */
export function workerLines(people) {
  const lines = []
  for (const person of people) {
    if (!person.card || person.blocked) continue
    if (person.state === 'gone') {
      lines.push(`to pia: needs resume: ${person.key} has ${person.card.id} "${person.card.title}" in progress and its session is gone; resume that agent`)
    } else if (person.state === 'idle' && person.idleMs >= IDLE_MINUTES * MIN) {
      const minutes = Math.floor(person.idleMs / MIN)
      lines.push(`poke ${person.key} on ${person.card.id}: idle ${minutes} min; last update: ${String(person.lastUpdate ?? '(none)').slice(0, 120)}`)
    }
  }
  return lines
}

/**
 * Pia's triggers, each named when it is dead: her listener (board events), her round timer (a round post or mail), her
 * mail (undelivered or unread), her hand-backs (a worker handed back with an open card and no resume), and the assigning
 * (cards in To do with no assignee while workers are idle). The line says WHICH trigger, and the one wake step for it.
 * `ages` are minutes since the last evidence for each; null means no evidence was collected for it (not a fault).
 */
export function piaTriggerLines(ages) {
  const lines = []
  const dead = (name, limit, step) => {
    if (ages[name] !== null && ages[name] !== undefined && ages[name] > limit) {
      lines.push(`to pia: ${name} trigger silent ${ages[name]} min (over ${limit}): ${step}`)
    }
  }
  dead('listener', LISTENER_DOWN_MINUTES, 'restart your listener (listen.mjs pia 600)')
  dead('roundTimer', ROUND_SILENT_MINUTES, 're-arm your round timer (the Monitor sleep loop)')
  dead('mailUnread', MAIL_UNREAD_MINUTES, 'read your mail (mailbox.mjs read pia)')
  dead('handback', HANDBACK_MINUTES, 'resume the agent that handed back its card (see the card)')
  dead('unassigned', UNASSIGNED_IDLE_MINUTES, 'assign the cards in To do that have no assignee')
  return lines
}

/**
 * The escalations that go the other way: a go not given while load has been under 14 for 10 minutes (to Pia), a card in
 * a Verify column for 30 minutes (to Boss), a QUESTION to Boss unanswered for 30 minutes (to Boss).
 */
export function escalationLines({ goWaitMinutes, loadUnder14Minutes, verifyCards, questionMinutes }) {
  const lines = []
  if (goWaitMinutes !== null && goWaitMinutes !== undefined && loadUnder14Minutes >= GO_LOAD_MINUTES) {
    lines.push(`to pia: a go is waiting ${goWaitMinutes} min while load has been under 14 for ${loadUnder14Minutes} min; give the go or say why not`)
  }
  for (const card of verifyCards ?? []) {
    if (card.minutes >= VERIFY_MINUTES) lines.push(`to boss: ${card.id} "${card.title}" has been in ${card.column} for ${card.minutes} min`)
  }
  if (questionMinutes !== null && questionMinutes !== undefined && questionMinutes >= QUESTION_MINUTES) {
    lines.push(`to boss: a QUESTION has waited ${questionMinutes} min without an answer`)
  }
  return lines
}
