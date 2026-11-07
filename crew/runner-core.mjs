// The rules of the crew runner, pure: which cards a runner worker may take, what to do with a card it
// has run on before, and the plan for one pass. No network, no files, no clock of its own, so the kit
// test pins each rule. crew/runner.mjs reads the board and runs the plan.

export const RUNNER_LABEL = 'runner'
const ACTIVE_COLUMNS = new Set(['to do', 'in progress'])

export const DEFAULTS = { retryMinutes: 30, maxRuns: 3 }

/** A card a runner may take: To do or In progress, labelled `runner`, not finished. */
export function isEligible(card) {
  const column = String(card.column ?? '').trim().toLowerCase()
  const labels = (card.labels ?? []).map(label => String(label).trim().toLowerCase())
  return ACTIVE_COLUMNS.has(column) && labels.includes(RUNNER_LABEL) && !card.completed
}

export function eligibleCards(cards) {
  return cards.filter(isEligible)
}

/**
 * What the runner does with one card, given what it did before. `state` is { runs, lastRunAt,
 * lastSeenUpdate, asked } for this worker and card, or null when it has never run on it.
 * `lastSeenUpdate` is the card's updatedAt after the runner's last run or ask, so only a change
 * made by someone else (Pia's answer, a new update) counts as news.
 *   start  run the worker on the card now
 *   wait   it ran recently and nothing new happened on the card
 *   ask    it has used its runs: post a QUESTION to Pia, once
 *   stop   it has used its runs and has already asked: do nothing
 * News on the card starts it at once, even after its runs are used up: an answer from Pia is what
 * it waited for. Otherwise it runs again only after retryMinutes, and never past maxRuns.
 */
export function nextAction(state, card, now, options = {}) {
  const { retryMinutes, maxRuns } = { ...DEFAULTS, ...options }
  const runs = state?.runs ?? 0
  if (runs === 0) return 'start'
  if (card.updatedAt != null && card.updatedAt !== state.lastSeenUpdate) return 'start'
  if (runs >= maxRuns) return state.asked ? 'stop' : 'ask'
  if (now - state.lastRunAt >= retryMinutes * 60_000) return 'start'
  return 'wait'
}

/**
 * The plan for one pass. `workers` are { key, runner, provider, model } (model null when no name is
 * pinned for it). `cards` maps a key to its cards, `states` maps a key to { [cardId]: state }.
 * A worker with no pinned model is refused, never started.
 */
export function planPass({ workers, cards, states = {}, now, options = {} }) {
  const plan = []
  for (const worker of workers) {
    if (!worker.model) {
      plan.push({ key: worker.key, action: 'refuse', reason: `no model is pinned for ${worker.runner}/${worker.provider}` })
      continue
    }
    for (const card of eligibleCards(cards[worker.key] ?? [])) {
      const state = states[worker.key]?.[card.id] ?? null
      plan.push({ key: worker.key, card, action: nextAction(state, card, now, options), model: worker.model })
    }
  }
  return plan
}

/** One line per plan item, for the dry run and the log. */
export function formatPlan(plan) {
  if (!plan.length) return ['nothing to run: no runner worker has an eligible card']
  return plan.map((item) => {
    if (item.action === 'refuse') return `refuse ${item.key}: ${item.reason}`
    return `${item.action} ${item.key} on ${item.card.id} "${item.card.title}" (${item.model})`
  })
}
