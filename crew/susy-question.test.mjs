// Susy never pokes Boss for an unanswered question on a card that has no QUESTION: update (card mwc5y4ccau9en3m3m7b, item 3).
// The ladder moves to the next rung after two pokes at the current one (rung = floor(pokes / 2)). A question with only an @pia
// mention is a question to Pia, so its ladder stops at Pia: Boss is never poked for it. A real QUESTION: update keeps Boss as the
// next rung. Fake board data, no dev server. Run: cd crew && node --test susy-question.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findPokes, keyOfName } from './susy.mjs'

const MIN = 60000
const NOW = Date.UTC(2026, 10, 17, 13, 0, 0)
const at = minutesAgo => new Date(NOW - minutesAgo * MIN).toISOString()
const keyOf = keyOfName({})
const agent = key => `crew ${key} (agent)`
const update = (author, body, minutesAgo) => ({ id: `u-${Math.random()}`, author, body, at: at(minutesAgo) })

function card(id, updates) {
  return {
    id,
    title: `card ${id}`,
    column: 'Blocked',
    assignee: 'Wynn Worker',
    tags: [],
    completed: false,
    updatedAt: NOW - 60 * MIN,
    blocked: false,
    blockedBy: [],
    updates
  }
}

// Pia was poked twice already (25 and 20 minutes ago): the question's next rung would be Boss, if its ladder has one.
const pokedTwice = [
  update(agent('susy'), 'poked pia | unanswered question | at ' + at(25), 25),
  update(agent('susy'), 'poked pia | unanswered question | at ' + at(20), 20)
]

test('an @pia mention with no QUESTION: line is never escalated to Boss', () => {
  const c = card('m1', [update(agent('wynn'), '@Pia Planner can you look at this?', 30), ...pokedTwice])
  const { actions } = findPokes([c], { now: NOW, keyOf, agents: {} })
  assert.equal(actions.filter(a => a.reason === 'unanswered question' && a.to === 'boss').length, 0, 'no poke to Boss for a mention without a QUESTION: line')
})

test('the same timing with a real QUESTION: line does escalate to Boss (the rule is not dropped for everything)', () => {
  const c = card('q1', [update(agent('wynn'), 'QUESTION: which column?', 30), ...pokedTwice])
  const { actions } = findPokes([c], { now: NOW, keyOf, agents: {} })
  assert.equal(actions.filter(a => a.reason === 'unanswered question' && a.to === 'boss').length, 1, 'a QUESTION: line escalates to Boss after two pokes at Pia')
})
