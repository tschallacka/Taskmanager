// Pat Precheck's state: where she is for a card in Verify PM, and what her five checks say about it. The rules are pure,
// so they can be tested without a renderer or a board. The checks are the ones on Pat's template (PAT.md.tmpl).
import { routes } from '../actor'

export interface PatUpdate {
  /** The crew key of the author, or '' for someone outside the crew. */
  by: string
  body: string
  /** Epoch milliseconds. */
  at: number
}

export interface PatCard {
  column: string
  tags: string[]
  /** Minutes of work logged on the card (`log_time`), in total. */
  minutesLogged: number
  /** Images attached to the card. */
  attachments: number
  updates: PatUpdate[]
}

/** Pat's state at a card: walking to it and checking, or nothing (she has no place at a card that is not in her column). */
export type PatState = 'check' | null

export interface Checks {
  /** Every acceptance criterion is met: a worker's update says so for each one. Not judged by the code; taken from the thread. */
  criteria: boolean
  /** Time is logged on the card. */
  time: boolean
  /** The worker's test output shows passes and no failure. */
  tests: boolean
  /** A screenshot is attached, when something a person sees changed (the card carries `verify UX`). */
  screenshot: boolean
  /** The worker's update says lint is clean. */
  lint: boolean
}

/** The column Pat works. */
export const PAT_COLUMN = 'Verify PM'

/** Pat's state at a card: `check` while the card is in her column and has no verdict yet, else no state. */
export function patStateOf(card: PatCard): PatState {
  if (card.column !== PAT_COLUMN) return null
  const verdict = card.updates.filter(update => update.body.startsWith('PRECHECK:')).at(-1)
  if (!verdict) return 'check'
  // A worker's word after her verdict means the card was fixed and is in her column again: a new check.
  const workerAfter = card.updates.some(update => update.by !== 'pat' && update.at > verdict.at)
  return workerAfter ? 'check' : null
}

/** The verdict she has posted, read from the thread: the latest update starting `PRECHECK:`. */
export function verdictOf(card: PatCard): 'pass' | 'fail' | null {
  const latest = card.updates.filter(update => update.body.startsWith('PRECHECK:')).at(-1)
  if (!latest) return null
  return latest.body.startsWith('PRECHECK: pass') ? 'pass' : 'fail'
}

/** Her five checks, from the card as it is. Criteria and lint are read from the worker's words; the rest from the record. */
export function checksOf(card: PatCard): Checks {
  const workerWords = card.updates.map(update => update.body).join('\n')
  const tests = /\b\d+\s+pass/i.test(workerWords) && /\b(0|zero)\s+fail|fail(ed|ures)?:?\s*0\b/i.test(workerWords)
  return {
    criteria: /acceptance criteria/i.test(workerWords) && /\bmet\b/i.test(workerWords),
    time: card.minutesLogged > 0,
    tests,
    screenshot: !card.tags.includes('verify ux') || card.attachments > 0,
    lint: /lint[^\n]*\b(clean|no (errors|warnings)|0 (errors|warnings))\b/i.test(workerWords)
  }
}

/** `pass` only when all five checks hold. */
export function passes(checks: Checks): boolean {
  return Object.values(checks).every(Boolean)
}

// ── The office's piece: Pat stands at the desk of the worker whose card she is checking, for as long as the check runs.
// The desk is the card's assignee; a card with no worker has no desk, so she has no walk.

export interface PatData {
  card: PatCard
  /** The crew key of the card's worker (its assignee), or '' when there is none. */
  worker: string
}

export interface PatRoleState {
  worker: string
}

/** The pause at the desk, in seconds, while she looks the card over. */
export const CHECK_STOP_SECONDS = 10

routes.register<PatData, PatRoleState>('pat', {
  stateOf: ({ card, worker }) => (patStateOf(card) === 'check' && worker ? { worker } : null),
  plan: ({ worker }) => routes.walkToDesk(worker, 'stand', { stopSeconds: CHECK_STOP_SECONDS })
})

/** The numbered findings a fail names: each check that does not hold. */
export function findingsOf(checks: Checks): string[] {
  const names: Record<keyof Checks, string> = {
    criteria: 'acceptance criteria not shown as met',
    time: 'no time logged on the card',
    tests: 'no test output with passes and zero failures',
    screenshot: 'no screenshot for a change a person sees',
    lint: 'no clean lint result in the update'
  }
  return (Object.keys(checks) as (keyof Checks)[]).filter(key => !checks[key]).map(key => names[key])
}
