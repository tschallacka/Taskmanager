// The rules of the crew runner, pure: which cards a runner worker may take, what to do with a card it
// has run on before, and the plan for one pass. No network, no files, no clock of its own, so the kit
// test pins each rule. crew/runner.mjs reads the board and runs the plan.

export const RUNNER_LABEL = 'runner'
const ACTIVE_COLUMNS = new Set(['to do', 'in progress'])

export const DEFAULTS = { retryMinutes: 30, maxRuns: 3, runTimeoutMinutes: 30 }

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
 * The card as the runner needs it, from a get_task answer. `updateCount` is updatesMatched, the number of
 * updates on the card. Posting an update does not change updatedAt, so the count is what shows news.
 */
export function cardFrom(full) {
  if (typeof full?.id !== 'string') throw new Error('get_task: the answer names no task')
  if (typeof full.updatesMatched !== 'number') throw new Error(`get_task ${full.id}: the answer gives no updatesMatched`)
  return { id: full.id, title: full.title, column: full.column, labels: full.labels ?? [], completed: Boolean(full.completed), updateCount: full.updatesMatched }
}

/**
 * What the runner does with one card, given what it did before. `state` is { runs, lastRunAt,
 * lastSeenCount, asked, unread } for this worker and card, or null when it has never run on it.
 * `lastSeenCount` is the card's updateCount after the runner's last run or ask, so only an update made by
 * someone else (Pia's answer, a new update) counts as news. `unread` means the card could not be re-read
 * after the runner's own run or question, so the baseline is not known yet (repairUnread).
 *   start  run the worker on the card now
 *   wait   it ran recently and nothing new happened on the card
 *   ask    it has used exactly maxRuns: post a QUESTION to Pia, once
 *   stop   nothing to do: it asked already, it ran past maxRuns, or its baseline is not known yet
 * News on the card starts it at once, even after its runs are used up: an answer from Pia is what
 * it waited for. Before its runs are used up, it runs again only after retryMinutes.
 */
export function nextAction(state, card, now, options = {}) {
  const { retryMinutes, maxRuns } = { ...DEFAULTS, ...options }
  const runs = state?.runs ?? 0
  if (runs === 0) return 'start'
  if (state.unread) return 'stop'
  if (card.updateCount != null && card.updateCount !== state.lastSeenCount) return 'start'
  if (runs > maxRuns) return 'stop'
  if (runs === maxRuns) return state.asked ? 'stop' : 'ask'
  if (now - state.lastRunAt >= retryMinutes * 60_000) return 'start'
  return 'wait'
}

/**
 * Gives each state whose baseline is unknown the card's updateCount as this pass read it. Only a card read
 * in this pass counts. Returns the worker keys whose states changed, so the caller writes them.
 */
export function repairUnread(states, cards) {
  const changed = new Set()
  for (const [key, byCard] of Object.entries(states)) {
    for (const [id, state] of Object.entries(byCard)) {
      if (!state?.unread) continue
      const card = (cards[key] ?? []).find(c => c.id === id)
      if (!card || card.updateCount == null) continue
      byCard[id] = { ...state, unread: false, lastSeenCount: card.updateCount }
      changed.add(key)
    }
  }
  return [...changed]
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
