// Susy's check, with fake board data (no dev server). Run: cd crew && node --test susy.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { authorKey, cardsFrom, cycleCards, findPokes, keyOfName, median, setAgent, staleRoundLine, thresholdsFrom } from './susy.mjs'

const MIN = 60000
const NOW = Date.UTC(2026, 10, 7, 13, 0, 0)
const at = minutesAgo => new Date(NOW - minutesAgo * MIN).toISOString()
const keyOf = keyOfName({})

/** A card as cardsFrom makes it, with the fields the tests vary. */
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
const update = (author, body, minutesAgo) => ({ id: `u-${Math.random()}`, author, body, at: at(minutesAgo) })
const agent = key => `crew ${key} (agent)`
const run = (cards, extra = {}) => findPokes(cards, { now: NOW, keyOf, agents: {}, ...extra })

test('author keys: a crew agent is its key, a person is not', () => {
  assert.equal(authorKey('crew pia (agent)'), 'pia')
  assert.equal(authorKey('Maria Pia'), null)
})

test('a Blocked card with a BLOCKED ON line pokes the named person after the threshold; without a line, nobody is poked for it', () => {
  const named = card('b1', { column: 'Blocked', updates: [update(agent('pia'), 'BLOCKED ON wynn: push actor_id to arnotes_test_wynn', 30)] })
  const pokes = run([named]).actions.filter(a => a.kind === 'poke' && a.reason === 'blocked, waiting on wynn')
  assert.equal(pokes.length, 1)
  assert.equal(pokes[0].to, 'wynn')
  const unnamed = card('b2', { column: 'Blocked', updates: [update(agent('pia'), 'waiting', 30)] })
  assert.equal(run([unnamed]).actions.filter(a => a.kind === 'poke' && a.reason.startsWith('blocked, waiting on')).length, 0)
})

test('thresholds: defaults, overridden by crew.json, a bad value falls back', () => {
  assert.deepEqual(thresholdsFrom({}), { questionMinutes: 10, idleMinutes: 10, gateMinutes: 15, cleanGrantMinutes: 5, cleanPlanMinutes: 10, cleanDoneMinutes: 15, stuckMinutes: 240 })
  assert.equal(thresholdsFrom({ susy: { questionMinutes: 3, idleMinutes: -1 } }).questionMinutes, 3)
  assert.equal(thresholdsFrom({ susy: { idleMinutes: -1 } }).idleMinutes, 10)
})

test('a question to Pia with no answer after 10 minutes is poked once, to Pia', () => {
  const q = card('q1', { column: 'Blocked', assignee: 'Wynn Worker', updates: [update(agent('wynn'), 'QUESTION: which column?', 12)] })
  const { actions } = run([q])
  const pokes = actions.filter(a => a.kind === 'poke')
  assert.equal(pokes.length, 1)
  assert.equal(pokes[0].to, 'pia')
  assert.equal(pokes[0].reason, 'unanswered question')
  assert.match(pokes[0].marker, /^poked pia \| unanswered question \| at 2026-11-07T13:00:00/)
})

test('a question younger than the threshold is not poked yet', () => {
  const q = card('q2', { column: 'Blocked', assignee: 'Wynn Worker', updates: [update(agent('wynn'), 'QUESTION: ok?', 4)] })
  assert.equal(run([q]).actions.filter(a => a.kind === 'poke').length, 0)
})

test('an answer from Pia ends the question: no poke, and an open poke is cleared', () => {
  const q = card('q3', {
    column: 'Blocked',
    assignee: 'Wynn Worker',
    updates: [
      update(agent('wynn'), 'QUESTION: which column?', 30),
      update(agent('susy'), 'poked pia | unanswered question | at ' + at(20), 20),
      update(agent('pia'), 'Use Verify PM.', 5)
    ]
  })
  const { actions } = run([q])
  assert.equal(actions.filter(a => a.kind === 'poke').length, 0)
  assert.equal(actions.filter(a => a.kind === 'clear').length, 1)
})

test('a poke is not repeated while the reason holds and the threshold has not passed since it', () => {
  const q = card('q4', {
    column: 'Blocked',
    assignee: 'Wynn Worker',
    updates: [
      update(agent('wynn'), 'QUESTION: which column?', 30),
      update(agent('susy'), 'poked pia | unanswered question | at ' + at(3), 3)
    ]
  })
  assert.deepEqual(run([q]).actions, [])
})

test('the second poke comes a threshold after the first; two ignored pokes go up to Pia', () => {
  const base = [update(agent('wynn'), 'QUESTION: which column?', 60)]
  const first = card('q5', {
    column: 'Blocked', assignee: 'Wynn Worker',
    updates: [...base, update(agent('susy'), 'poked pia | unanswered question | at ' + at(12), 12)]
  })
  const again = run([first]).actions.filter(a => a.kind === 'poke')
  assert.equal(again.length, 1, 'one threshold after the poke: poke again to the same rung')
  assert.equal(again[0].to, 'pia')

  const ignored = card('q6', {
    column: 'Blocked', assignee: 'Wynn Worker',
    updates: [
      ...base,
      update(agent('susy'), 'poked pia | unanswered question | at ' + at(24), 24),
      update(agent('susy'), 'poked pia | unanswered question | at ' + at(12), 12)
    ]
  })
  const escalated = run([ignored]).actions.filter(a => a.kind === 'poke')
  assert.equal(escalated.length, 1)
  assert.equal(escalated[0].to, 'boss', 'after two pokes to Pia with no change: one step up')
  assert.match(escalated[0].text, /@cato/)
})

test('after the last rung the card is quiet', () => {
  const updates = [update(agent('wynn'), 'QUESTION: x', 200)]
  for (let i = 6; i >= 1; i--) updates.push(update(agent('susy'), `poked ${i > 4 ? 'boss' : 'pia'} | unanswered question | at ${at(i * 10 + 20)}`, i * 10 + 20))
  const c = card('q7', { column: 'Blocked', assignee: 'Wynn Worker', updatedAt: NOW - 250 * MIN, updates })
  assert.equal(run([c]).actions.filter(a => a.kind === 'poke').length, 0)
})

test('a change on the card after the poke makes the poke stale: it is cleared, then poked anew', () => {
  const c = card('q8', {
    column: 'Blocked',
    assignee: 'Wynn Worker',
    updates: [
      update(agent('wynn'), 'QUESTION: first', 90),
      update(agent('susy'), 'poked pia | unanswered question | at ' + at(60), 60),
      update(agent('wynn'), 'QUESTION: second, after the answer', 30)
    ]
  })
  const { actions } = run([c])
  assert.equal(actions.filter(a => a.kind === 'clear').length, 1)
  const pokes = actions.filter(a => a.kind === 'poke')
  assert.equal(pokes.length, 1, 'the new question is poked from zero')
  assert.equal(pokes[0].to, 'pia')
})

test('a worker idle on an In progress card is poked to the worker, after 10 minutes with no update', () => {
  const c = card('w1', { column: 'In progress', assignee: 'Wynn Worker', updatedAt: NOW - 30 * MIN, updates: [update(agent('wynn'), 'Started.', 15)] })
  const pokes = run([c]).actions.filter(a => a.kind === 'poke')
  assert.equal(pokes.length, 1)
  assert.equal(pokes[0].to, 'wynn')
  assert.equal(pokes[0].reason, 'in progress, no update')
})

test('an assigned To do card is not started while the worker has no card in progress: poked to the worker', () => {
  const c = card('w2', { column: 'To do', assignee: 'Wade Worker', updatedAt: NOW - 30 * MIN })
  const pokes = run([c]).actions.filter(a => a.kind === 'poke')
  assert.equal(pokes.length, 1)
  assert.equal(pokes[0].to, 'wade')
  assert.equal(pokes[0].reason, 'assigned, not started')
})

test('a To do card waits while its worker is busy on another card', () => {
  const busy = card('w3', { column: 'In progress', assignee: 'Wade Worker', updatedAt: NOW - 60 * MIN, updates: [update(agent('wade'), 'Working.', 40)] })
  const waiting = card('w4', { column: 'To do', assignee: 'Wade Worker', updatedAt: NOW - 60 * MIN })
  const reasons = run([busy, waiting]).actions.filter(a => a.cardId === 'w4')
  assert.equal(reasons.length, 0)
})

test('a gate card the owner has not touched for 15 minutes is poked to the owner', () => {
  const c = card('g1', { column: 'Verify CQ', updatedAt: NOW - 20 * MIN })
  const pokes = run([c]).actions.filter(a => a.kind === 'poke')
  assert.equal(pokes.length, 1)
  assert.equal(pokes[0].to, 'nina')
  assert.equal(pokes[0].reason, 'gate untouched')
})

test('a gate the owner has picked up is left alone', () => {
  const c = card('g2', { column: 'Verify QA', updatedAt: NOW - 40 * MIN, updates: [update(agent('quincy'), 'Looking.', 10)] })
  assert.equal(run([c]).actions.length, 0)
})

test('a Verify PM card: the owner is Pia, so the ladder is Pia, then Boss', () => {
  const c = card('g3', { column: 'Verify PM', updatedAt: NOW - 40 * MIN })
  const pokes = run([c]).actions.filter(a => a.kind === 'poke')
  assert.equal(pokes[0].to, 'pia')
})

test('a card blocked by a card with no owner is poked to Pia', () => {
  const blocker = card('b1', { column: 'To do', assignee: undefined })
  const c = card('b2', { column: 'To do', blocked: true, blockedBy: ['b1'], updatedAt: NOW - 30 * MIN })
  const pokes = run([blocker, c]).actions.filter(a => a.cardId === 'b2' && a.kind === 'poke')
  assert.equal(pokes.length, 1)
  assert.equal(pokes[0].reason, 'blocked by an unowned card')
})

test('a poke line says who, why, the card and one suggested message; no agent id without Pia writing one', () => {
  const c = card('m1', { column: 'In progress', assignee: 'Wynn Worker', updatedAt: NOW - 30 * MIN, updates: [update(agent('wynn'), 'secret body text', 15)] })
  const line = run([c]).lines[0]
  assert.match(line, /^poke wynn on m1 "card m1": in progress, no update \(15 min; @wynn in a card update \(no agent id\)\)\. Say: "post what you did on m1 "card m1" or move it back to To do" \(to wynn\)$/)
  assert.ok(!line.includes('secret body text'), 'no card body in the line')
  assert.ok(!/ag-|agent [0-9a-f]{4}/.test(line), 'no agent id that Pia did not write')
})

test('cards that block each other in a loop are found', () => {
  const a = card('c1', { blockedBy: ['c2'] })
  const b = card('c2', { blockedBy: ['c1'] })
  const free = card('c3', { blockedBy: ['c1'] })
  assert.deepEqual([...cycleCards([a, b, free])].sort(), ['c1', 'c2'])
})

test('a Done card gets no poke, and an open poke on it is cleared', () => {
  const c = card('d1', {
    column: 'Done',
    assignee: 'Wynn Worker',
    updates: [update(agent('wynn'), 'QUESTION: old', 90), update(agent('susy'), 'poked pia | unanswered question | at ' + at(60), 60)]
  })
  const { actions } = run([c])
  assert.equal(actions.filter(a => a.kind === 'poke').length, 0)
  assert.equal(actions.filter(a => a.kind === 'clear').length, 1)
})

test('cleaning: a ready card not assigned to the cleaner is poked to Pia', () => {
  const c = card('k1', { column: 'Blocked', tags: ['ready to clean'], assignee: 'Wynn Worker', updatedAt: NOW - 30 * MIN })
  const pokes = run([c]).actions.filter(a => a.kind === 'poke')
  assert.equal(pokes[0].reason, 'ready to clean, not assigned to cleaner')
  assert.equal(pokes[0].to, 'pia')
})

test('cleaning: a granted card whose cleaner has not worked on it for 5 minutes is poked to the cleaner', () => {
  const c = card('k2', { tags: ['cleaning granted'], assignee: 'Janet', updatedAt: NOW - 8 * MIN })
  const pokes = run([c], { cleaner: 'janet' }).actions.filter(a => a.kind === 'poke')
  assert.equal(pokes[0].to, 'janet')
})

test('cleaning: a finished card (cleaned) gets no pokes', () => {
  const c = card('k3', { tags: ['clean done', 'cleaned'], updatedAt: NOW - 60 * MIN })
  assert.equal(run([c]).actions.filter(a => a.kind === 'poke').length, 0)
})

test('the lines name the agent id when Pia has written it down, and say so when she has not', () => {
  const c = card('w9', { column: 'In progress', assignee: 'Wynn Worker', updatedAt: NOW - 30 * MIN })
  const withId = run([c], { agents: { wynn: 'a1b2' } }).lines[0]
  const withoutId = run([c]).lines[0]
  assert.match(withId, /SendMessage to agent a1b2/)
  assert.match(withoutId, /no agent id/)
})

test('a stale last round is reported; a recent one is not', () => {
  assert.match(staleRoundLine(at(9), NOW), /Susy was not woken/)
  assert.equal(staleRoundLine(at(2), NOW), null)
  assert.equal(staleRoundLine('not a time', NOW), null)
})

test('cardsFrom reads the board answer and attaches the updates', () => {
  const board = { columns: [{ name: 'To do', tasks: [{ id: 'x', title: 'T', assignee: 'Wren Worker', labels: ['a'], updatedAt: at(5), blocked: false }] }] }
  const [c] = cardsFrom(board, { x: [{ id: '1', author: agent('wren'), body: 'hi', at: at(3) }] })
  assert.equal(c.column, 'To do')
  assert.equal(c.assignee, 'Wren Worker')
  assert.equal(c.updates.length, 1)
})

test('stuck in column: a card far older than the others in its column, at least 4 hours, is poked to its owner', () => {
  const old = card('s1', { column: 'Verify', assignee: 'Wynn Worker', updatedAt: NOW - 300 * MIN })
  const peers = [1, 2, 3].map(n => card(`p${n}`, { column: 'Verify', updatedAt: NOW - 20 * MIN }))
  const pokes = run([old, ...peers]).actions.filter(a => a.cardId === 's1' && a.kind === 'poke')
  assert.equal(pokes.length, 1)
  assert.equal(pokes[0].reason, 'stuck in column')
  assert.equal(pokes[0].to, 'wynn')
})

test('stuck in column: not when the card is young, not when only as old as its neighbours, not in a resting column', () => {
  const peers = [1, 2, 3].map(n => card(`q${n}`, { column: 'Verify', updatedAt: NOW - 200 * MIN }))
  const same = card('t1', { column: 'Verify', updatedAt: NOW - 250 * MIN })
  assert.equal(run([same, ...peers]).actions.filter(a => a.cardId === 't1').length, 0, 'not three times the median')
  const young = card('t2', { column: 'Verify', updatedAt: NOW - 100 * MIN })
  const few = [1, 2, 3].map(n => card(`r${n}`, { column: 'Verify', updatedAt: NOW - 5 * MIN }))
  assert.equal(run([young, ...few]).actions.filter(a => a.cardId === 't2').length, 0, 'under four hours')
  const resting = card('t3', { column: 'Blocked', updatedAt: NOW - 600 * MIN })
  const restPeers = [1, 2, 3].map(n => card(`u${n}`, { column: 'Blocked', updatedAt: NOW - 5 * MIN }))
  assert.equal(run([resting, ...restPeers]).actions.filter(a => a.cardId === 't3').length, 0, 'Blocked is resting')
})

test('stuck in column needs at least two other cards in the column', () => {
  const lone = card('v1', { column: 'Verify', updatedAt: NOW - 600 * MIN })
  const one = card('v2', { column: 'Verify', updatedAt: NOW - 5 * MIN })
  assert.equal(run([lone, one]).actions.filter(a => a.cardId === 'v1').length, 0)
})

test('median: the middle value, or the mean of the two middle ones', () => {
  assert.equal(median([5, 1, 3]), 3)
  assert.equal(median([4, 1, 3, 2]), 2.5)
})

test('setAgent: sets a person id, forgets it with "-", and refuses a value that is not a plain id', () => {
  assert.deepEqual(setAgent({}, 'wynn', 'a1b2'), { wynn: 'a1b2' })
  assert.deepEqual(setAgent({ wynn: 'a1b2', pia: 'p9' }, 'wynn', '-'), { pia: 'p9' })
  assert.throws(() => setAgent({}, 'wynn', 'a b; rm'), /not an agent id/)
  assert.throws(() => setAgent({}, 'Wynn Worker', 'a1'), /not a person key/)
})

test('the check reads an agent id Pia wrote, and names it in the SendMessage line', () => {
  const c = card('w10', { column: 'In progress', assignee: 'Wynn Worker', updatedAt: NOW - 30 * MIN })
  assert.match(run([c], { agents: setAgent({}, 'wynn', 'ag-42') }).lines[0], /SendMessage to agent ag-42/)
})

// Card mwcytequ3yduaddw3o4: Susy's own pokes and markers are not card changes. The board moves updatedAt on her post too.
const poke = (to, reason, minutesAgo) => update(agent('susy'), `poked ${to} | ${reason} | at ${at(minutesAgo)}`, minutesAgo)
const LADDER_STEPS = ['wynn', 'wynn', 'pia', 'pia', 'boss', 'boss']

test('her own pokes are not changes: the ladder climbs wynn, wynn, pia, pia, boss, boss, then quiet', () => {
  for (let done = 0; done <= LADDER_STEPS.length; done++) {
    // `done` pokes on the card, one every 11 minutes, the last 11 minutes ago; the board's updatedAt is that last poke.
    const updates = []
    for (let i = 0; i < done; i++) updates.push(poke(LADDER_STEPS[i], 'in progress, no update', 11 * (done - i)))
    const updatedAt = done ? NOW - 11 * MIN : NOW - 60 * MIN
    const c = card(`ladder${done}`, { column: 'In progress', assignee: 'Wynn Worker', updatedAt, updates })
    const pokes = run([c]).actions.filter(a => a.kind === 'poke')
    if (done === LADDER_STEPS.length) assert.equal(pokes.length, 0, 'after the last rung the card is quiet')
    else {
      assert.equal(pokes.length, 1, `poke ${done + 1}`)
      assert.equal(pokes[0].to, LADDER_STEPS[done], `poke ${done + 1} goes to ${LADDER_STEPS[done]}`)
    }
  }
})

test('a later update by another person resets the ladder: the open poke is cleared, and the next one starts from the first rung', () => {
  const updates = [poke('wynn', 'in progress, no update', 44), poke('wynn', 'in progress, no update', 33), poke('pia', 'in progress, no update', 22), poke('pia', 'in progress, no update', 11)]
  updates.push(update(agent('wynn'), 'Working on it.', 5))
  const c = card('reset1', { column: 'In progress', assignee: 'Wynn Worker', updatedAt: NOW - 5 * MIN, updates })
  const soon = run([c])
  assert.equal(soon.actions.filter(a => a.kind === 'clear').length, 1, 'the open poke closes when the card changes')
  assert.equal(soon.actions.filter(a => a.kind === 'poke').length, 0, 'nothing is poked within the threshold of the change')
  const later = run([c], { now: NOW + 6 * MIN }).actions.filter(a => a.kind === 'poke')
  assert.equal(later.length, 1)
  assert.equal(later[0].to, 'wynn', 'after the reset the ladder starts again at the worker')
})

test('a move with no update, then her post: the move still counts, so the ladder restarts from the move', () => {
  // Wynn's update 40 min ago; a poke 35 min ago; Pia moves the card 20 min ago (no update, only the card time); Susy pokes
  // 10 min ago, and her marker says the card read 20 min ago before it. The move is the last change: one poke since it.
  const updates = [
    update(agent('wynn'), 'Started.', 40),
    poke('wynn', 'in progress, no update', 35),
    update(agent('susy'), `poked wynn | in progress, no update | at ${at(10)} | was ${at(20)}`, 10)
  ]
  const c = card('move1', { column: 'In progress', assignee: 'Wynn Worker', updatedAt: NOW - 10 * MIN, updates })
  const pokes = run([c]).actions.filter(a => a.kind === 'poke')
  assert.equal(pokes.length, 1)
  assert.equal(pokes[0].to, 'wynn', 'counted from the move, the next poke is still the worker, not Pia')
})

// Her told-pia posts (SUSY.md line 105) are hers too: they move the card time, and must not reset or climb the ladder.
// Each ends `| was <card time as read>`, as SUSY.md now asks, so a move before one still counts.
const told = (minutesAgo, wasMinutesAgo) => update(agent('susy'), `told pia | wynn stuck | at ${at(minutesAgo)} | was ${at(wasMinutesAgo)}`, minutesAgo)

test('told-pia posts between her pokes: the count holds, the ladder climbs, a later update by another person resets it', () => {
  for (let done = 0; done <= LADDER_STEPS.length; done++) {
    const updates = []
    for (let i = 0; i < done; i++) {
      const minutes = 11 * (done - i)
      updates.push(poke(LADDER_STEPS[i], 'in progress, no update', minutes), told(minutes - 2, minutes))
    }
    const updatedAt = done ? NOW - 9 * MIN : NOW - 60 * MIN
    const c = card(`told${done}`, { column: 'In progress', assignee: 'Wynn Worker', updatedAt, updates })
    const pokes = run([c]).actions.filter(a => a.kind === 'poke')
    if (done === LADDER_STEPS.length) assert.equal(pokes.length, 0, 'after the last rung the card is quiet')
    else {
      assert.equal(pokes.length, 1, `told-pia poke ${done + 1}`)
      assert.equal(pokes[0].to, LADDER_STEPS[done], `told-pia poke ${done + 1} goes to ${LADDER_STEPS[done]}`)
    }
  }
  const reset = [...[44, 33, 22, 11].map((m, i) => poke(LADDER_STEPS[i], 'in progress, no update', m)), update(agent('wynn'), 'Working on it.', 5)]
  const c = card('told-reset', { column: 'In progress', assignee: 'Wynn Worker', updatedAt: NOW - 5 * MIN, updates: reset })
  assert.equal(run([c]).actions.filter(a => a.kind === 'clear').length, 1, 'the open poke closes at the change')
  const later = run([c], { now: NOW + 6 * MIN }).actions.filter(a => a.kind === 'poke')
  assert.equal(later.length, 1)
  assert.equal(later[0].to, 'wynn', 'the ladder starts again at the worker')
})

test('a move with no update, then her told-pia post with its was suffix: the move still counts', () => {
  // Two pokes by 40 and 35 min ago, Pia moves the card 20 min ago (card time only), then her told-pia post 10 min ago whose
  // was-suffix says the card read 20 min ago. Counted from the move there are no pokes since it: the next poke is the worker.
  // Without the move it would be two pokes since the start, and the next poke would go to Pia.
  const updates = [
    update(agent('wynn'), 'Started.', 50),
    poke('wynn', 'in progress, no update', 40),
    poke('wynn', 'in progress, no update', 35),
    told(10, 20)
  ]
  const c = card('move-told', { column: 'In progress', assignee: 'Wynn Worker', updatedAt: NOW - 10 * MIN, updates })
  const pokes = run([c]).actions.filter(a => a.kind === 'poke')
  assert.equal(pokes.length, 1)
  assert.equal(pokes[0].to, 'wynn', 'counted from the move, the next poke is still the worker')
})
