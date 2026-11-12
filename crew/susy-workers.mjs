// The worker collector for Susy's activity checks (card mwdbhbl2). A worker is a subagent inside Pia's process, so its
// evidence is its own transcript under Pia's project folder, read by activity.mjs (activityRows, Boss's state names:
// working, running, listening, ended, handedback, silent). This module maps those rows onto the poke rules:
//   - ended or handedback WITH a card In progress: needs resume (to Pia, at once);
//   - listening, silent or ended for 10+ minutes WITH a card In progress and not blocked: idle with work (poke);
//   - working or running: nothing; a WAITING marker on the card (younger than 45 minutes): nothing.
// No transcript for a worker in the window is no evidence, not a fault. Read only.
import { activityRows, piaProjectsDir, readCmdlines, isPiaProcess } from './activity.mjs'
import { MIN, IDLE_MINUTES, waitingOf } from './susy-activity.mjs'

export const WORKERS = ['wren', 'wick', 'wynn', 'wade']

/**
 * The folder of Pia's transcripts: CREW_PROJECTS when set, else crew.json "activity" "projects", else the folder derived from
 * the crew home (the same derivation activity.mjs uses for Pia's session).
 */
export function projectsRoot({ crewHome, crew, env = process.env }) {
  return env.CREW_PROJECTS || crew?.activity?.projects || piaProjectsDir(crewHome)
}

/** The rows of the crew's agents (and Pia's own), read from their transcripts, from activity.mjs. */
export function readWorkerRows({ root, now = Date.now(), cmdlines = readCmdlines(), hours = 6 }) {
  const alive = cmdlines.some(isPiaProcess)
  const rows = activityRows({ root, hours, now, cmdlines, alive })
  return new Map(rows.map(row => [row.key, row]))
}

/** The card a worker holds: one In progress, assigned to its key. */
function cardOf(key, cards, keyOf) {
  return cards.find(c => c.column === 'In progress' && keyOf(c.assignee) === key) ?? null
}

/**
 * The poke-rule entries for the workers, one per worker that has a transcript: { key, state, card, blocked, idleMs,
 * lastUpdate }. `state` is the poke rules' word: `gone` (needs resume), `idle` (poke after 10 minutes), `waiting`, or
 * `working`. Boss's state names stay on the rows (see `workerStates`).
 */
export function workerPeople({ rows, cards, keyOf, now = Date.now() }) {
  const people = []
  for (const key of WORKERS) {
    const row = rows.get(key)
    if (!row) continue
    const card = cardOf(key, cards, keyOf)
    const lastUpdate = card?.updates?.at(-1)?.body ?? null
    const idleMs = row.mins * MIN
    const waiting = card ? (card.updates ?? []).some(u => waitingOf(u, now)) : false
    let state = 'working'
    if (waiting) state = 'waiting'
    else if (card && (row.state === 'ended' || row.state === 'handedback')) state = 'gone'
    else if (card && !card.blocked && ['listening', 'silent'].includes(row.state) && idleMs >= IDLE_MINUTES * MIN) state = 'idle'
    people.push({
      key,
      state,
      reason: row.state,
      card: card ? { id: card.id, title: card.title } : null,
      blocked: Boolean(card?.blocked),
      idleMs,
      lastUpdate
    })
  }
  return people
}

/** The worker states in Boss's names, for the heartbeat and the office view: key, state, minutes since the last step. */
export function workerStates({ rows }) {
  return WORKERS.filter(key => rows.has(key)).map(key => ({ key, state: rows.get(key).state, minutesSinceStep: rows.get(key).mins }))
}
