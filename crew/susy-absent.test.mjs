// Susy's absent line (the daemon's rule): a person with open work and no running agent id is named once on their card,
// so Pia starts them. Covers the rule (absentLines, absentActions), what the daemon posts (postBody), and the tick.
// Pure, no database, no board. Run:
//   node --test crew/susy-absent.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { absentActions, absentLines, keyOfName } from './susy.mjs'
import { postBody } from './susy-daemon.mjs'

const MIN = 60000
const NOW = Date.UTC(2026, 10, 7, 13, 0, 0)
const at = minutesAgo => new Date(NOW - minutesAgo * MIN).toISOString()
const keyOf = keyOfName({})
const agent = key => `crew ${key} (agent)`
const update = (author, body, minutesAgo) => ({ id: `u-${Math.random()}`, author, body, at: at(minutesAgo) })

function card(id, fields = {}) {
  return {
    id,
    title: `card ${id}`,
    column: 'To do',
    assignee: undefined,
    tags: [],
    completed: false,
    updatedAt: NOW - 60 * MIN,
    blocked: false,
    blockedBy: [],
    updates: [],
    ...fields
  }
}

test('absent: a person with an open card and no agent id is named once, and again only after a change on the card', () => {
  const open = card('w11', { column: 'In progress', assignee: 'Wynn Worker', updatedAt: NOW - 30 * MIN })
  const opts = { agents: {}, keyOf }
  assert.deepEqual(absentLines([open], opts), ['absent wynn | not running: no agent id | on w11 "card w11" | 1 open'])
  // Susy's marker after the last change: no repeat.
  const marked = { ...open, updates: [{ id: 'm1', author: agent('susy'), body: 'absent wynn | not running | at x', at: at(20) }] }
  assert.deepEqual(absentLines([marked], opts), [])
  // A change after the marker: the line comes back.
  const changed = { ...marked, updates: [...marked.updates, update(agent('wynn'), 'moved', 5)] }
  assert.equal(absentLines([changed], opts).length, 1)
})

test('absent: a person with an agent id, a person with no open card, and a done card are not named', () => {
  const opts = { keyOf }
  const open = card('w12', { column: 'In progress', assignee: 'Wynn Worker', updatedAt: NOW - 30 * MIN })
  assert.deepEqual(absentLines([open], { ...opts, agents: { wynn: 'ag-1' } }), [])
  assert.deepEqual(absentLines([card('w13', { column: 'Done', assignee: 'Wynn Worker' })], { ...opts, agents: {} }), [])
  assert.deepEqual(absentLines([card('w14', { column: 'Backlog', assignee: 'Wynn Worker' })], { ...opts, agents: {} }), [])
})

test('absent: a gate owner with a card in their gate is checked, and Pia with a card in Verify PM', () => {
  const opts = { keyOf, agents: {} }
  const lines = absentLines([card('g1', { column: 'Verify CQ', assignee: 'Wren Worker' })], opts)
  assert.ok(lines.some(line => line.startsWith('absent nina |')))
  assert.ok(lines.some(line => line.startsWith('absent wren |')))
  assert.ok(absentLines([card('g2', { column: 'Verify PM', assignee: 'Wynn Worker' })], opts).some(line => line.startsWith('absent pia |')))
})

test('the daemon makes one absent action per person, keyed by person so two people on one card are two actions', () => {
  const cards = [card('c1', { column: 'In progress', assignee: 'Wynn Worker' }), card('c2', { column: 'Verify CQ', assignee: 'Wade Worker' })]
  const actions = absentActions(cards, { agents: {}, keyOf })
  const reasons = actions.map(a => a.reason).sort()
  assert.ok(reasons.includes('not running wynn'))
  assert.ok(reasons.includes('not running nina'))
  assert.equal(new Set(actions.map(a => a.reason)).size, actions.length, 'one action per person')
  for (const action of actions) assert.equal(action.kind, 'absent')
})

test('the absent post is two lines: the marker first (the ledger reads it), then the one thing to do for Pia', () => {
  const [action] = absentActions([card('c3', { column: 'In progress', assignee: 'Wynn Worker' })], { agents: {}, keyOf })
  const body = postBody(action)
  const [marker, say] = body.split('\n')
  assert.equal(marker, 'absent wynn | not running: no agent id | on c3 "card c3" | 1 open')
  assert.equal(say, '@pia wynn is not running: start them (1 open, card c3).')
})

test('an absent person who is Pia is told to Boss and copied to Pia on the same card', () => {
  const [action] = absentActions([card('c4', { column: 'Verify PM', assignee: 'Pia Planner' })], { agents: {}, keyOf })
  const body = postBody(action)
  assert.match(body, /@cato Pia is not running: start her/)
  assert.match(body, /@pia Pia is not running: start her/)
})

test('a person with a running agent id gets no absent action', () => {
  const actions = absentActions([card('c5', { column: 'In progress', assignee: 'Wynn Worker' })], { agents: { wynn: 'ag-9' }, keyOf })
  assert.deepEqual(actions, [])
})
