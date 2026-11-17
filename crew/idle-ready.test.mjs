// The idle notice (card mwjdf1cyigzw8f1apu): the crew is idle while the board has ready work and nothing has happened for
// 30 minutes. Ready work is a card in To do or in a Verify column, not Done, not blocked. The notice mails Pia and Boss
// once, and again only when the set of ready cards changes. A fake board and fake activity; no server. Run:
//   cd crew && node --test idle-ready.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readyCards, idleState, noticeFor, runIdleCheck, QUIET_MINUTES, columnsOf, checkOnce, senderKey } from './idle-ready.mjs'

const NOW = 1_700_000_000_000
const minutesAgo = m => NOW - m * 60_000
const card = (id, extra = {}) => ({ id, title: `card ${id}`, labels: [], blocked: false, updatedAt: minutesAgo(600), ...extra })
const board = () => [
  { name: 'Backlog', tasks: [card('bl1')] },
  { name: 'To do', tasks: [card('todo1'), card('todo-blocked', { labels: ['blocked'] }), card('todo-failing', { labels: ['test failing'] })] },
  { name: 'In progress', tasks: [card('wip1')] },
  { name: 'Verify PM', tasks: [card('vpm1'), card('vpm-blocked', { blocked: true })] },
  { name: 'Verify CQ', tasks: [card('vcq1')] },
  { name: 'Done', tasks: [card('done1')] },
  { name: 'Blocked', tasks: [card('blocked1')] }
]
const quiet = mins => [{ key: 'wren', state: 'silent', mins, what: 'read the card' }]
const memoryStore = () => ({
  value: null,
  read() {
    return this.value
  },
  write(v) {
    this.value = v
  }
})

test('the ready cards are To do and Verify cards, not Done, not blocked (the blocked flag or label)', () => {
  const ids = readyCards(board()).map(c => c.id).sort()
  assert.deepEqual(ids, ['todo1', 'vcq1', 'vpm1'])
})

test('the board read as get_board returns it: a card with an open blocker is not ready work', () => {
  // The fields get_board really returns: `blocked`, `labels`, `updates` (a count) and `updatedAt`. There is no latestUpdate.
  const columns = [
    { name: 'To do', tasks: [
      { id: 'open', title: 'open', labels: [], blocked: false, summary: '', updates: 2, updatedAt: minutesAgo(600) },
      { id: 'blocker', title: 'has an open blocker', labels: [], blocked: true, summary: '', updates: 1, updatedAt: minutesAgo(600) }
    ] },
    { name: 'Verify QA', tasks: [{ id: 'qa', title: 'qa', labels: [], blocked: false, summary: '', updates: 0, updatedAt: minutesAgo(600) }] }
  ]
  assert.deepEqual(readyCards(columns).map(c => c.id).sort(), ['open', 'qa'])
})

test('a card with no ready column (Backlog, In progress) is not ready work', () => {
  const ids = readyCards(board()).map(c => c.id)
  assert.equal(ids.includes('bl1'), false)
  assert.equal(ids.includes('wip1'), false)
})

test('the quiet threshold is 30 minutes', () => {
  assert.equal(QUIET_MINUTES, 30)
})

test('29 minutes of quiet is not idle; 31 minutes is', () => {
  assert.equal(idleState({ columns: board(), activity: quiet(29), now: NOW }).idle, false)
  assert.equal(idleState({ columns: board(), activity: quiet(31), now: NOW }).idle, true)
})

test('a recent step by any crew member resets the clock', () => {
  const activity = [{ key: 'wren', state: 'working', mins: 2, what: 'editing' }, { key: 'pia', state: 'silent', mins: 90, what: 'old' }]
  assert.equal(idleState({ columns: board(), activity, now: NOW }).idle, false)
})

test('a recent card update on the board resets the clock, even when the activity is old', () => {
  const columns = board()
  columns[1].tasks[0] = card('todo1', { updatedAt: minutesAgo(4) })
  assert.equal(idleState({ columns, activity: quiet(120), now: NOW }).idle, false)
})

test('no ready work is never idle, however long it is quiet', () => {
  const columns = [{ name: 'Done', tasks: [card('d')] }, { name: 'Blocked', tasks: [card('b')] }]
  const state = idleState({ columns, activity: quiet(500), now: NOW })
  assert.equal(state.idle, false)
  assert.deepEqual(state.ready, [])
})

test('the state names the ready cards and the last activity, for the mail', () => {
  const state = idleState({ columns: board(), activity: quiet(45), now: NOW })
  assert.deepEqual(state.ready.sort(), ['todo1', 'vcq1', 'vpm1'])
  assert.equal(state.lastActivity.who, 'wren')
  assert.equal(state.lastActivity.minutes, 45)
})

test('the notice: idle goes out once; the same state sends nothing; a changed card set sends once more', () => {
  const idle = idleState({ columns: board(), activity: quiet(40), now: NOW })
  const first = noticeFor(null, idle)
  assert.equal(first?.kind, 'idle')
  assert.match(first?.text ?? '', /^idle with ready work: todo1, vcq1, vpm1, last activity wren /)
  assert.equal(noticeFor(idle, idle), null)
  const more = board()
  more[1].tasks.push(card('todo2'))
  const changed = idleState({ columns: more, activity: quiet(40), now: NOW })
  assert.equal(noticeFor(idle, changed)?.kind, 'changed')
})

test('back at work sends one line, and then nothing', () => {
  const idle = idleState({ columns: board(), activity: quiet(40), now: NOW })
  const back = idleState({ columns: board(), activity: quiet(3), now: NOW })
  assert.equal(noticeFor(idle, back)?.kind, 'back')
  assert.equal(noticeFor(back, back), null)
})

test('a check mails Pia and Boss once, and saves the state so the next run does not repeat it', () => {
  const store = {
    value: null,
    read() {
      return this.value
    },
    write(v) {
      this.value = v
    }
  }
  const sent = []
  const send = (to, text) => sent.push({ to, text })
  const args = { columns: board(), activity: quiet(40), now: NOW, store, send }
  const first = runIdleCheck(args)
  assert.equal(first?.kind, 'idle')
  assert.deepEqual(sent.map(s => s.to).sort(), ['boss', 'pia'])
  assert.equal(runIdleCheck(args), null, 'a second run in the same state sends nothing')
  assert.equal(sent.length, 2)
})

test('a board reply with no columns list is an error, not an empty board', () => {
  assert.throws(() => columnsOf({ error: 'board unreachable' }), /no columns list/)
  assert.throws(() => columnsOf(null), /no columns list/)
  assert.deepEqual(columnsOf({ columns: [] }), [])
})

test('a ready column cut by get_board stops the check: no mail, and the saved state is not written', () => {
  const columns = board()
  columns[1].omitted = 3 // To do, a ready column, cut to 50 cards
  const store = memoryStore()
  const sent = []
  const notice = runIdleCheck({ columns, activity: quiet(40), now: NOW, store, send: to => sent.push(to) })
  assert.equal(notice, null)
  assert.equal(store.value, null)
  assert.deepEqual(sent, [])
})

// The command's path with a fake board: the fetch and the mail are stubs, so no server is touched.
const fakeCreds = {
  base: 'https://board.example',
  board: { id: 'b1' },
  people: { susy: { apiKey: 'susy-test-key' }, boss: { apiKey: 'boss-test-key' } }
}
// The notice is Susy's: her key reads the board and sends the mail. Boss's key is never used for it.
test('the notice is sent with Susy\'s key, not Boss\'s', () => {
  assert.equal(senderKey(fakeCreds), 'susy-test-key')
  assert.throws(() => senderKey({ ...fakeCreds, people: { boss: { apiKey: 'boss-test-key' } } }), /no Susy account/)
})
const boardReply = (reply, status = 200) => async () => ({
  ok: status === 200,
  status,
  json: async () => ({ result: { content: [{ text: JSON.stringify(reply) }] } })
})

test('the check reads get_board with Susy\'s key and mails Pia and Boss once when the crew is idle', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return boardReply({ columns: board() })()
  }
  const sent = []
  const store = memoryStore()
  const notice = await checkOnce({ creds: fakeCreds, fetchImpl, activity: quiet(40), now: NOW, store, send: to => sent.push(to) })
  assert.equal(notice?.kind, 'idle')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://board.example/api/mcp')
  assert.match(calls[0].init.body, /"name":"get_board"/)
  assert.equal(calls[0].init.headers.authorization, 'Bearer susy-test-key')
  assert.deepEqual(sent.sort(), ['boss', 'pia'])
})

test('a board reply with no columns stops the check: no mail, and the saved state is not written', async () => {
  const store = memoryStore()
  const sent = []
  await assert.rejects(
    checkOnce({ creds: fakeCreds, fetchImpl: boardReply({ error: 'board unreachable' }), activity: quiet(40), now: NOW, store, send: to => sent.push(to) }),
    /no columns list/
  )
  assert.equal(store.value, null)
  assert.deepEqual(sent, [])
})

test('a board that answers with an HTTP error stops the check', async () => {
  const store = memoryStore()
  await assert.rejects(
    checkOnce({ creds: fakeCreds, fetchImpl: boardReply({}, 503), activity: quiet(40), now: NOW, store, send: () => {} }),
    /503/
  )
  assert.equal(store.value, null)
})

test('a cut column that is not ready (Done, Backlog) does not stop the check', () => {
  const columns = board()
  columns[0].omitted = 25 // Backlog
  columns[5].omitted = 25 // Done
  const store = memoryStore()
  const sent = []
  const notice = runIdleCheck({ columns, activity: quiet(40), now: NOW, store, send: to => sent.push(to) })
  assert.equal(notice?.kind, 'idle')
  assert.deepEqual(sent.sort(), ['boss', 'pia'])
})
