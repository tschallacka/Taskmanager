// crew restart-brief: which cards each person holds, their column, and the last update, with the board replaced by
// fixtures. Run:
//   node --test crew/restart-brief.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cardsOf, lastUpdateOf, briefFor, restartBrief } from './restart-brief.mjs'

// A fake board: my_tasks per person, and get_task per card.
function fakeRunner(boards) {
  return (who, tool, args) => {
    const b = boards[who]
    if (!b) return null
    if (tool === 'my_tasks') return { tasks: b.cards.map(c => ({ id: c.id, title: c.title })) }
    if (tool === 'get_task') {
      const card = b.cards.find(c => c.id === args.id)
      return card ? { id: card.id, column: card.column, updates: card.updates ?? [] } : null
    }
    return null
  }
}

test('cardsOf reads the list from either shape of my_tasks', () => {
  assert.deepEqual(cardsOf({ tasks: [{ id: 'a', title: 'A' }] }), [{ id: 'a', title: 'A' }])
  assert.deepEqual(cardsOf([{ id: 'b', title: 'B' }]), [{ id: 'b', title: 'B' }])
  assert.deepEqual(cardsOf(null), [])
})

test('lastUpdateOf takes the newest update, collapses its whitespace and caps it at 300 characters', () => {
  const task = { column: 'In progress', updates: [{ body: 'line one\n\n  line   two ' + 'x'.repeat(400) }] }
  const { column, body } = lastUpdateOf(task)
  assert.equal(column, 'In progress')
  assert.equal(body.length, 300)
  assert.match(body, /^line one line two x/)
  assert.deepEqual(lastUpdateOf({ column: 'To do', updates: [] }), { column: 'To do', body: '(no update yet)' })
})

test('only open cards are in a brief; Done cards are left out', () => {
  const runner = fakeRunner({
    wren: {
      cards: [
        { id: 'c1', title: 'Open one', column: 'To do', updates: [{ body: 'start here' }] },
        { id: 'c2', title: 'Finished', column: 'Done', updates: [{ body: 'shipped' }] },
        { id: 'c3', title: 'In review', column: 'Verify PM', updates: [{ body: 'waiting for Pat' }] }
      ]
    }
  })
  const blocks = briefFor('wren', runner)
  assert.deepEqual(blocks.map(b => b.id), ['c1', 'c3'])
  assert.equal(blocks[0].body, 'start here')
})

test('a person with nothing open is left out of the plan; the rest are listed in order', () => {
  const runner = fakeRunner({
    wick: { cards: [{ id: 'w1', title: 'W', column: 'In progress', updates: [{ body: 'going' }] }] },
    nina: { cards: [{ id: 'n1', title: 'N', column: 'Done', updates: [] }] }
  })
  const plan = restartBrief(['nina', 'wick', 'pat'], runner)
  assert.deepEqual(plan.map(p => p.who), ['wick'])
  assert.equal(plan[0].blocks[0].id, 'w1')
})

test('a person whose board call fails contributes nothing and does not stop the others', () => {
  const runner = fakeRunner({ wick: { cards: [{ id: 'w1', title: 'W', column: 'To do', updates: [] }] } })
  const plan = restartBrief(['pat', 'wick'], runner)
  assert.deepEqual(plan.map(p => p.who), ['wick'])
})
