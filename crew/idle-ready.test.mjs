// The idle notice (card mwjdf1cyigzw8f1apu): the crew is idle while the board has ready work and nothing has happened for
// 30 minutes. Ready work is a card in To do or in a Verify column, not Done, not blocked. The notice mails Pia and Boss
// once, and again only when the set of ready cards changes. A fake board and fake activity; no server. Run:
//   cd crew && node --test idle-ready.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readyCards, idleState, noticeFor, runIdleCheck, QUIET_MINUTES } from './idle-ready.mjs'

const NOW = 1_700_000_000_000
const minutesAgo = m => NOW - m * 60_000
const card = (id, extra = {}) => ({ id, title: `card ${id}`, labels: [], updatedAt: minutesAgo(600), latestUpdate: '', ...extra })
const board = () => [
  { name: 'Backlog', tasks: [card('bl1')] },
  { name: 'To do', tasks: [card('todo1'), card('todo-blocked', { labels: ['blocked'] }), card('todo-failing', { labels: ['test failing'] })] },
  { name: 'In progress', tasks: [card('wip1')] },
  { name: 'Verify PM', tasks: [card('vpm1'), card('vpm-blocked-line', { latestUpdate: 'BLOCKED ON boss: push actor_id' })] },
  { name: 'Verify CQ', tasks: [card('vcq1')] },
  { name: 'Done', tasks: [card('done1')] },
  { name: 'Blocked', tasks: [card('blocked1')] }
]
const quiet = mins => [{ key: 'wren', state: 'silent', mins, what: 'read the card' }]

test('the ready cards are To do and Verify cards, not Done, not blocked, not on a BLOCKED ON line', () => {
  const ids = readyCards(board()).map(c => c.id).sort()
  assert.deepEqual(ids, ['todo1', 'vcq1', 'vpm1'])
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
